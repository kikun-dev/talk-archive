import PostalMime from "postal-mime";
import type { Address, Email } from "postal-mime";
import type { TalkImportRecord } from "@/usecases/importUseCases";
import { fetchRemoteImage } from "@/repositories/remoteImageRepository";

// --- .eml パース ---

export type ParsedEmlMessage = {
  /**
   * From アドレス（小文字正規化）
   * 取り違え防止の警告表示・重複排除キーとして使う（#128 設計簡素化。
   * トークは常に1対1で参加者割り当てはトーク参加者から行うため、
   * From アドレスから参加者名を導出する用途はなくなった）
   */
  senderAddress: string;
  /** Date ヘッダを ISO 8601（UTC 正規化）に変換したもの */
  postedAt: string;
  /** Subject（「無題」または空白のみは null） */
  title: string | null;
  /** text/plain 優先、なければ html からタグ除去 + エンティティ復元。trim して空なら null */
  content: string | null;
  /** inline/attachment 問わず image/* の最初の1件 */
  image: { filename: string; mimeType: string; data: Uint8Array } | null;
  /**
   * HTML 本文中の最初の `<img src="https://...">` （リモート画像参照）。
   * 添付画像（image）がある場合は常に null（#129: 実メールは添付ファイルを持たず、画像は
   * HTML パート内のリモート参照のみだが、添付画像がある .eml では cid 参照と重複する
   * 可能性があるため、添付を優先し HTML 側の img は無視する）
   */
  remoteImageUrl: string | null;
  /** 2枚目以降の画像枚数（取り込み対象外の警告用）。添付画像がある場合は添付の残り枚数、
   * ない場合は HTML 内リモート画像の残り枚数を数える */
  extraImageCount: number;
};

/**
 * .eml インポート処理のユーザー向けエラー
 * メッセージに対象ファイル名を含める。action 層はこの message をそのまま画面に返してよい
 */
export class EmlImportError extends Error {}

/** .eml 1ファイルの最大サイズ（10MB、#115） */
export const MAX_EML_FILE_SIZE = 10 * 1024 * 1024;

/** 一度にインポートできる最大ファイル数（#115） */
export const MAX_EML_FILE_COUNT = 200;

/**
 * .eml ファイル合計サイズの上限（50MB、#128）
 * Server Actions のリクエストボディサイズ上限（bodySizeLimit: 60MB、next.config.ts）から、
 * multipart エンコードのオーバーヘッドと speakerAssignmentsJson 等の他フィールド分の
 * 余裕を差し引いた値。各ファイル10MB以下という制約だけでは、例えば9MB×7件のように
 * 画面上の検証（件数・各ファイルサイズ）を通過したうえでリクエスト全体が60MBの上限に
 * 抵触し、アプリのエラー表示に到達できないケースを防ぐ
 */
export const MAX_EML_TOTAL_SIZE = 50 * 1024 * 1024;

function isMailbox(address: Address | undefined): address is {
  name: string;
  address: string;
} {
  return (
    address !== undefined &&
    !("group" in address && address.group !== undefined) &&
    typeof address.address === "string" &&
    address.address.trim().length > 0
  );
}

function normalizeEmlDate(date: string | undefined): string | null {
  if (!date) {
    return null;
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

/** タイトルの最大文字数（JSON インポート経路の検証上限と同じ値）。
 * Subject は自動由来のため行エラーにせず切り詰める */
const MAX_TITLE_LENGTH = 200;

/**
 * 文字列から U+0000（NUL）を取り除く
 * PostgreSQL の jsonb/text カラムは NUL 文字を保存できないため、Subject・本文の
 * 最終文字列からは（数値文字参照経由に限らず）NUL を無条件に除去する（#128 第3ラウンド
 * レビュー対応 P1）
 */
function stripNulCharacters(text: string): string {
  return text.replace(/\0/g, "");
}

function normalizeTitle(subject: string | undefined): string | null {
  if (subject === undefined) {
    return null;
  }
  const trimmed = stripNulCharacters(subject).trim();
  if (trimmed.length === 0 || trimmed === "無題") {
    return null;
  }
  return trimmed.slice(0, MAX_TITLE_LENGTH);
}

const SURROGATE_RANGE_START = 0xd800;
const SURROGATE_RANGE_END = 0xdfff;
const MAX_CODE_POINT = 0x10ffff;

/**
 * String.fromCodePoint に渡して安全な Unicode コードポイントかどうかを検証する
 * 整数でない・0以下・0x10FFFF 超・サロゲート範囲（0xD800〜0xDFFF）はすべて無効とし、
 * RangeError を未然に防ぐ（#128: 異常な HTML 数値文字参照でバッチ全体が失敗する不具合対応）。
 *
 * U+0000（NUL）も無効として扱う（codePoint > 0）。String.fromCodePoint(0) は例外を
 * 投げないため既存の防御（isValidCodePoint）をすり抜け、`&#0;` / `&#x0;` が本文中の
 * 生の NUL 文字にデコードされてしまう。PostgreSQL の jsonb/text カラムは NUL 文字を
 * 保存できないため、プレビューは通過するものの import_records_atomic RPC でバッチ
 * 全体が失敗する（#128 第3ラウンドレビュー対応 P1）
 */
function isValidCodePoint(codePoint: number): boolean {
  return (
    Number.isInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= MAX_CODE_POINT &&
    !(codePoint >= SURROGATE_RANGE_START && codePoint <= SURROGATE_RANGE_END)
  );
}

/**
 * `&#NNNN;`（10進）・`&#xHHHH;`（16進）の数値文字参照のみをデコードする
 * isValidCodePoint による検証を通し、無効なコードポイント（範囲外・サロゲート範囲・NUL）は
 * 元の表記のまま残す（#128）。text/plain・HTML どちらの経路からも呼べるよう、
 * 名前付きエンティティ（`&amp;` 等）のデコードとは切り離してある（#129: text/plain の
 * `&amp;` 等はリテラルの可能性があるため、text/plain 経路では数値文字参照のみを対象とする）
 */
function decodeNumericCharacterReferences(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
      const codePoint = parseInt(hex, 16);
      return isValidCodePoint(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const codePoint = parseInt(dec, 10);
      return isValidCodePoint(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    });
}

// html-entities.js は postal-mime の公開 API（package.json の exports）に含まれず
// 深いパスからの import はできないため、フォールバック用に最小限のデコードを自前で持つ
function decodeHtmlEntities(text: string): string {
  return decodeNumericCharacterReferences(text)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'");
}

/** html 本文をプレーンテキストへ変換する（タグ除去 + エンティティ復元） */
function htmlToText(html: string): string {
  const withoutScripts = html.replace(
    /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );
  const withBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(withoutTags);
}

/**
 * Gmail アプリが画像添付を text/plain 側に残す際のマーカー行（例:
 * `[image: 1142-20220301-041051.jpg]`）にのみマッチする（#129）。
 * 行全体（前後の空白を除く）がこの形式である場合のみ除去対象とし、本文中に
 * 偶然似た文字列が現れても誤って消さないようにする
 */
const IMAGE_MARKER_LINE_PATTERN = /^\s*\[image:[^\]]*\]\s*$/i;

/**
 * text/plain 本文から `[image: ...]` マーカーのみの行を取り除き、除去によってできた
 * 連続空行を1行に詰める（#129）
 */
function removeImageMarkerLines(text: string): string {
  const lines = text.split(/\r\n|\r|\n/).filter(
    (line) => !IMAGE_MARKER_LINE_PATTERN.test(line),
  );

  const collapsed: string[] = [];
  for (const line of lines) {
    const isBlank = line.trim().length === 0;
    const previousIsBlank =
      collapsed.length > 0 &&
      collapsed[collapsed.length - 1].trim().length === 0;
    if (isBlank && previousIsBlank) {
      continue;
    }
    collapsed.push(line);
  }
  return collapsed.join("\n");
}

/**
 * 配信システム（cuenote 等）が HTML を表示できないクライアント向けに text/plain 側へ
 * 埋め込む定型スタブ本文（実本文は HTML パートにある）にのみマッチする（#129）
 */
const STUB_BODY_PATTERN =
  /^メールがうまく表示されない方はこちらをご覧ください\s*(https?:\/\/\S+)?$/;

/**
 * text/plain・html いずれの経路の最終結果にも NUL 除去を適用する（防御の多重化）。
 * decodeHtmlEntities 側で数値文字参照由来の NUL は無効化しているが、text/plain 本文には
 * 生の NUL バイトがそのまま混入し得るため、ここでも取り除く。NUL を除去した結果が空に
 * なった場合は「本文なし」として扱い、text 経路なら html 経路へ、両方とも空なら呼び出し元
 * の「本文が空」判定（画像なしなら行エラー）へ自然に流す（#128 第3ラウンドレビュー対応 P1）
 *
 * text/plain 経路は以下の順で処理する（#129: 実メール41通の調査結果対応）
 *   1. Gmail の `[image: ...]` マーカー行を除去
 *   2. 数値文字参照（`&#NNNN;` / `&#xHHHH;`）をデコード（名前付きエンティティは対象外。
 *      text/plain では `&amp;` 等がリテラルの可能性があるため）
 *   3. NUL 除去 → trim
 * その結果が空、またはスタブ本文（STUB_BODY_PATTERN）に一致する場合は、実本文が
 * HTML パートにあると判断して html 経路へフォールバックする
 */
function normalizeContent(
  text: string | undefined,
  html: string | undefined,
): string | null {
  if (typeof text === "string") {
    const withoutMarkers = removeImageMarkerLines(text);
    const decoded = decodeNumericCharacterReferences(withoutMarkers);
    const cleanedText = stripNulCharacters(decoded).trim();
    if (cleanedText.length > 0 && !STUB_BODY_PATTERN.test(cleanedText)) {
      return cleanedText;
    }
  }
  if (typeof html === "string") {
    const fromHtml = stripNulCharacters(htmlToText(html)).trim();
    if (fromHtml.length > 0) {
      return fromHtml;
    }
  }
  return null;
}

function toUint8Array(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  return new Uint8Array(content);
}

/**
 * PostalMime.parse に渡す前に string を ArrayBuffer へ変換する。
 * PostalMime 自身も string 入力を内部で ArrayBuffer 化するが、実行環境によっては
 * （例: jsdom のテスト環境は TextEncoder は Node 由来だが ArrayBuffer は jsdom 独自の
 * レルムを持つため）`instanceof ArrayBuffer` の判定がずれ、内部のバイトオフセット
 * 計算が壊れることがある。呼び出し側で確実な ArrayBuffer に変換して渡すことで避ける
 */
function toArrayBuffer(raw: ArrayBuffer | string): ArrayBuffer {
  if (typeof raw !== "string") {
    return raw;
  }
  const encoded = new TextEncoder().encode(raw);
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  );
}

/** mimeType の subtype から `image-N.ext` 形式のファイル名を組み立てる（添付・リモート画像共用） */
export function guessImageFilename(mimeType: string, index: number): string {
  const subtype = mimeType.split("/")[1]?.split("+")[0] || "bin";
  return `image-${index + 1}.${subtype}`;
}

function extractImage(
  attachments: Email["attachments"],
): { image: ParsedEmlMessage["image"]; extraImageCount: number } {
  const imageAttachments = attachments.filter((attachment) =>
    attachment.mimeType.startsWith("image/"),
  );

  if (imageAttachments.length === 0) {
    return { image: null, extraImageCount: 0 };
  }

  const first = imageAttachments[0];
  return {
    image: {
      filename: first.filename ?? guessImageFilename(first.mimeType, 0),
      mimeType: first.mimeType,
      data: toUint8Array(first.content),
    },
    extraImageCount: imageAttachments.length - 1,
  };
}

const IMG_TAG_PATTERN = /<img\b[^>]*>/gi;
const IMG_SRC_ATTR_PATTERN = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** `<img>` タグ群から src 属性の生の値（未デコード）を出現順に列挙する */
function extractImgSrcValues(html: string): string[] {
  const imgTags = html.match(IMG_TAG_PATTERN) ?? [];
  const srcValues: string[] = [];
  for (const tag of imgTags) {
    const match = IMG_SRC_ATTR_PATTERN.exec(tag);
    const rawSrc = match?.[1] ?? match?.[2] ?? match?.[3];
    if (rawSrc !== undefined) {
      srcValues.push(rawSrc);
    }
  }
  return srcValues;
}

/**
 * リモート画像の取得を許可する配信元の許可リスト（#129 レビュー対応: SSRF・
 * トラッキングピクセル対策）。任意の http/https を取得すると、細工した .eml の投入で
 * 内部ネットワークへの SSRF になり、一般の HTML メールではトラッキングピクセルを
 * 踏んでしまうため、実データに必要な配信元のみに限定する。
 * 新しい配信元を許可する場合は、この配列に `{ hostname, pathname }` を追加する
 * （hostname・pathname とも完全一致で判定。https・userinfo なし・ポート指定なしは
 * isAllowedRemoteImageUrl 側で共通に強制される）
 */
const ALLOWED_REMOTE_IMAGE_SOURCES: ReadonlyArray<{
  hostname: string;
  pathname: string;
}> = [
  { hostname: "mail-web.c-nogizaka46.com", pathname: "/mail/output/qimage" },
];

/**
 * リモート画像 URL が許可リストに一致するか検証する
 * https のみ・userinfo（username/password）なし・ポート指定なし・hostname と pathname が
 * 許可リストに完全一致、のすべてを満たす場合のみ許可する
 */
function isAllowedRemoteImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  if (url.username !== "" || url.password !== "") {
    return false;
  }
  if (url.port !== "") {
    return false;
  }
  return ALLOWED_REMOTE_IMAGE_SOURCES.some(
    (source) =>
      source.hostname === url.hostname && source.pathname === url.pathname,
  );
}

/**
 * HTML 本文から最初の許可されたリモート画像 URL を抽出する（#129）。
 * 許可リスト（ALLOWED_REMOTE_IMAGE_SOURCES）に一致しない `<img>` は remoteImageUrl にも
 * extraImageCount にも数えない。実メールの img src には `&amp;` エンティティが
 * 含まれるため（例: `qimage?image_name=abc123&amp;token=...`）、デコードしてから
 * URL として検証する
 */
function extractRemoteImageUrl(html: string | undefined): {
  remoteImageUrl: string | null;
  extraImageCount: number;
} {
  if (typeof html !== "string") {
    return { remoteImageUrl: null, extraImageCount: 0 };
  }

  const allowedUrls = extractImgSrcValues(html)
    .map((rawSrc) => decodeHtmlEntities(rawSrc))
    .filter(isAllowedRemoteImageUrl);

  if (allowedUrls.length === 0) {
    return { remoteImageUrl: null, extraImageCount: 0 };
  }

  return {
    remoteImageUrl: allowedUrls[0],
    extraImageCount: allowedUrls.length - 1,
  };
}

/**
 * .eml ファイル（RFC822 形式）をパースし、インポートに必要な情報を抽出する
 * パース不能・差出人アドレス欠落・Date欠落は EmlImportError（ファイル名を含むメッセージ）を投げる
 */
export async function parseEmlFile(
  raw: ArrayBuffer | string,
  filename: string,
): Promise<ParsedEmlMessage> {
  let email: Email;
  try {
    email = await PostalMime.parse(toArrayBuffer(raw));
  } catch {
    throw new EmlImportError(`${filename}: メールの解析に失敗しました`);
  }

  if (!isMailbox(email.from)) {
    throw new EmlImportError(
      `${filename}: 差出人のメールアドレスを取得できませんでした`,
    );
  }
  const senderAddress = email.from.address.trim().toLowerCase();

  const postedAt = normalizeEmlDate(email.date);
  if (postedAt === null) {
    throw new EmlImportError(`${filename}: 受信日時を取得できませんでした`);
  }

  const title = normalizeTitle(email.subject);

  // normalizeContent（HTML タグ除去・エンティティ復元を含む）は decodeHtmlEntities 側で
  // 既知の異常入力（範囲外コードポイント等）を防いでいるが、想定外の失敗が起きても
  // 1ファイルの異常でバッチ全体を落とさないよう、防御を二重化する（#128）
  let content: string | null;
  try {
    content = normalizeContent(email.text, email.html);
  } catch {
    throw new EmlImportError(`${filename}: 本文の解析に失敗しました`);
  }

  const { image, extraImageCount: attachmentExtraImageCount } = extractImage(
    email.attachments,
  );

  // 添付画像がある場合、HTML 内の img は cid 参照と重複する可能性があるため無視し、
  // 添付を優先する（remoteImageUrl は常に null。ParsedEmlMessage.remoteImageUrl のコメント参照）
  const { remoteImageUrl, extraImageCount: remoteExtraImageCount } =
    image === null
      ? extractRemoteImageUrl(email.html)
      : { remoteImageUrl: null, extraImageCount: 0 };
  const extraImageCount =
    image !== null ? attachmentExtraImageCount : remoteExtraImageCount;

  // 本文空・画像なし（添付・リモートいずれも無し）は text record（content 非null必須の
  // CHECK 制約 records_text_content_check）に違反し RPC のトランザクション全体を abort
  // させるため、ここで行エラーとして弾く（画像あり・本文空は image record として正当なので通す）
  if (image === null && remoteImageUrl === null && content === null) {
    throw new EmlImportError(`${filename}: 本文が空のため取り込めません`);
  }

  return {
    senderAddress,
    postedAt,
    title,
    content,
    image,
    remoteImageUrl,
    extraImageCount,
  };
}

// --- ParsedEmlMessage → TalkImportRecord 変換 ---

/**
 * ParsedEmlMessage を TalkImportRecord に変換する薄い変換関数
 * speaker には From アドレスをそのまま入れる（participant 割り当ては
 * 既存の speakerAssignments 機構をそのまま使う）。画像の実データはここでは扱わない
 * （record 作成後に attachRecordMedia で添付する）
 */
export function toTalkImportRecord(
  message: ParsedEmlMessage,
): TalkImportRecord {
  return {
    speaker: message.senderAddress,
    postedAt: message.postedAt,
    type: message.image || message.remoteImageUrl ? "image" : "text",
    title: message.title,
    content: message.content,
    hasAudio: false,
  };
}

// --- リモート画像のバッチ取得（#129） ---

/** リモート画像1件の取得タイムアウト */
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 15_000;

/**
 * リモート画像取得の同時実行数
 * 最大200通 × タイムアウト15秒の直列実行は最悪50分かかるため並列化する。
 * 配信元サーバーへの負荷と Server Action のメモリ使用量を抑えるため5に制限する
 */
const REMOTE_IMAGE_FETCH_CONCURRENCY = 5;

export type RemoteImageFetchTask = { key: string; url: string };

export type FetchedRemoteImage = {
  data: Uint8Array;
  contentType: string;
  filename: string;
};

/**
 * .eml インポート用にリモート画像をまとめて取得する（#129）
 * - 1件あたり MAX_EML_FILE_SIZE（10MB）・タイムアウト15秒で repository の
 *   fetchRemoteImage を呼ぶ
 * - 同時実行数 REMOTE_IMAGE_FETCH_CONCURRENCY（5）のワーカープールで並列化する
 * - 成功分の合計サイズが MAX_EML_TOTAL_SIZE（50MB）を超えた時点で、当該タスクと
 *   以降のタスクは失敗（null）にする（バッチ全体のメモリ使用量の上限）
 * - Content-Type はメディアタイプのみに正規化（`;` 以降除去・trim・小文字化）し、
 *   `image/` 始まりでなければ失敗（null）。filename は正規化後の subtype から導出する
 * - 戻り値は task.key → 取得結果（失敗は null）の Map。呼び出し元は null を
 *   添付失敗として扱う（メディア未添付レコードとして残る）
 */
export async function fetchRemoteImagesForImport(
  tasks: RemoteImageFetchTask[],
): Promise<Map<string, FetchedRemoteImage | null>> {
  const results = new Map<string, FetchedRemoteImage | null>();
  let totalFetchedBytes = 0;
  let isTotalSizeExceeded = false;
  let nextTaskIndex = 0;

  async function fetchOne(url: string): Promise<FetchedRemoteImage | null> {
    const fetched = await fetchRemoteImage(url, {
      timeoutMs: REMOTE_IMAGE_FETCH_TIMEOUT_MS,
      maxBytes: MAX_EML_FILE_SIZE,
    });
    if (!fetched.ok) {
      return null;
    }

    const contentType = fetched.contentType.split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      return null;
    }

    totalFetchedBytes += fetched.data.byteLength;
    if (totalFetchedBytes > MAX_EML_TOTAL_SIZE) {
      isTotalSizeExceeded = true;
      return null;
    }

    return {
      data: fetched.data,
      contentType,
      filename: guessImageFilename(contentType, 0),
    };
  }

  async function runWorker(): Promise<void> {
    while (nextTaskIndex < tasks.length) {
      const task = tasks[nextTaskIndex];
      nextTaskIndex += 1;
      if (isTotalSizeExceeded) {
        results.set(task.key, null);
        continue;
      }
      results.set(task.key, await fetchOne(task.url));
    }
  }

  const workers = Array.from(
    { length: Math.min(REMOTE_IMAGE_FETCH_CONCURRENCY, tasks.length) },
    () => runWorker(),
  );
  await Promise.all(workers);

  return results;
}
