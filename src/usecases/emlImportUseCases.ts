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
  /**
   * inline/attachment 問わず image/* の全件（出現順）。1件も無ければ空配列（#133）
   */
  images: { filename: string; mimeType: string; data: Uint8Array }[];
  /**
   * HTML 本文中の許可された `<img src="https://...">`（リモート画像参照）の全件（出現順、
   * 完全一致の重複は除く）。添付画像（images）が1件でもある場合は常に空配列（#129: 実メールは
   * 添付ファイルを持たず、画像は HTML パート内のリモート参照のみだが、添付画像がある .eml
   * では cid 参照と重複する可能性があるため、添付を優先し HTML 側の img は無視する。#133:
   * 複数画像インポートに伴い全件を保持する）
   */
  remoteImageUrls: string[];
  /**
   * このメールの安定した重複排除キーの元になる識別子（P1-2）。Message-ID があれば
   * `msgid:<正規化したMessage-ID>`、無ければ生バイト列の SHA-256 ハッシュによる
   * `sha256:<hex>`。expandEmlMessageToRecords が `${mailKey}#<連番>` として importKey を
   * 組み立てる。ファイル名は使わない（同名だが別内容のメールの衝突・リネーム時の
   * 重複判定崩れを防ぐため）
   */
  mailKey: string;
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
 * text/plain 本文から `[image: ...]` マーカーのみの行を取り除く（#129）
 * マーカー行が1行も無い場合は入力を完全に無変更（byte-identical）で返す。改行の
 * 正規化（CRLF→LF）や既存の連続空行の畳み込みは行わない（#132 レビュー対応 P1-1:
 * マーカーが無い大多数の通常本文まで一律に書き換えていたことで、CRLF や意図的な
 * 連続空行が失われ、本文の忠実性・既存の重複排除を損なっていた不具合の修正）。
 * マーカー行がある場合は、そのマーカー行を取り除き、除去によって直接できた空行の
 * 連続（マーカーの直前・直後がともに空行だった場合の2行）のみを1行に畳み込む。
 * マーカーと無関係な既存の連続空行は手を付けずそのまま残す
 */
function removeImageMarkerLines(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  const hasMarkerLine = lines.some((line) =>
    IMAGE_MARKER_LINE_PATTERN.test(line),
  );
  if (!hasMarkerLine) {
    return text;
  }

  const result: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!IMAGE_MARKER_LINE_PATTERN.test(line)) {
      result.push(line);
      continue;
    }
    // マーカー行は取り除く。直前（出力済みの最後の行）と直後の行がともに空行の
    // 場合のみ、マーカー除去でできた空行の重なりとみなして直後の空行も1行分
    // 読み飛ばし、空行1行に畳み込む
    const previousIsBlank =
      result.length > 0 && result[result.length - 1].trim().length === 0;
    const nextLine = lines[i + 1];
    const nextIsBlank = nextLine !== undefined && nextLine.trim().length === 0;
    if (previousIsBlank && nextIsBlank) {
      i += 1;
    }
  }
  return result.join("\n");
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

/**
 * Message-ID ヘッダの値を正規化する（P1-2）
 * 前後の空白を trim し、先頭の `<` と末尾の `>` を1つだけ取り除き、再度 trim してから
 * 小文字化する。結果が空文字列になる場合は呼び出し側で「Message-ID なし」として扱う
 */
function normalizeMessageId(value: string): string {
  let normalized = value.trim();
  if (normalized.startsWith("<")) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith(">")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized.trim().toLowerCase();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * メールの識別情報から、安定した重複排除キーの元になる mailKey を導出する（P1-2）。
 * 旧実装は `<元ファイル名>#<連番>` を import_key に使っていたが、ファイル名は
 * メールの内容と無関係な情報のため、同名だが別内容の .eml（2件目が誤って重複扱いされ
 * 取り込まれない）やファイルのリネーム（再インポート時に重複として検知できなくなる）に
 * 弱い。Message-ID（正規化のうえ `msgid:` 名前空間）を優先し、無ければメール本文の
 * 生バイト列の SHA-256 ハッシュ（`sha256:` 名前空間）にフォールバックする
 */
async function deriveMailKey(
  messageId: string | undefined,
  raw: ArrayBuffer,
): Promise<string> {
  if (typeof messageId === "string") {
    const normalized = normalizeMessageId(messageId);
    if (normalized.length > 0) {
      return `msgid:${normalized}`;
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

/** mimeType の subtype から `image-N.ext` 形式のファイル名を組み立てる（添付・リモート画像共用） */
export function guessImageFilename(mimeType: string, index: number): string {
  const subtype = mimeType.split("/")[1]?.split("+")[0] || "bin";
  return `image-${index + 1}.${subtype}`;
}

/** attachments から image/* をすべて出現順で抽出する（#133: 複数画像インポート） */
function extractImages(
  attachments: Email["attachments"],
): ParsedEmlMessage["images"] {
  return attachments
    .filter((attachment) => attachment.mimeType.startsWith("image/"))
    .map((attachment, index) => ({
      filename: attachment.filename ?? guessImageFilename(attachment.mimeType, index),
      mimeType: attachment.mimeType,
      data: toUint8Array(attachment.content),
    }));
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
 * HTML 本文から許可されたリモート画像 URL を全件抽出する（#129、#133: 全件抽出に変更）。
 * 許可リスト（ALLOWED_REMOTE_IMAGE_SOURCES）に一致しない `<img>` は含めない。実メールの
 * img src には `&amp;` エンティティが含まれるため（例: `qimage?image_name=abc123&amp;
 * token=...`）、デコードしてから URL として検証する。完全一致の重複 URL は取り除き、
 * 出現順を保つ
 */
function extractRemoteImageUrls(html: string | undefined): string[] {
  if (typeof html !== "string") {
    return [];
  }

  const allowedUrls = extractImgSrcValues(html)
    .map((rawSrc) => decodeHtmlEntities(rawSrc))
    .filter(isAllowedRemoteImageUrl);

  return [...new Set(allowedUrls)];
}

/**
 * .eml ファイル（RFC822 形式）をパースし、インポートに必要な情報を抽出する
 * パース不能・差出人アドレス欠落・Date欠落は EmlImportError（ファイル名を含むメッセージ）を投げる
 */
export async function parseEmlFile(
  raw: ArrayBuffer | string,
  filename: string,
): Promise<ParsedEmlMessage> {
  const rawArrayBuffer = toArrayBuffer(raw);

  let email: Email;
  try {
    email = await PostalMime.parse(rawArrayBuffer);
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

  const images = extractImages(email.attachments);

  // 添付画像がある場合、HTML 内の img は cid 参照と重複する可能性があるため無視し、
  // 添付を優先する（remoteImageUrls は常に空配列。ParsedEmlMessage.remoteImageUrls の
  // コメント参照）
  const remoteImageUrls =
    images.length > 0 ? [] : extractRemoteImageUrls(email.html);

  // 本文空・画像なし（添付・リモートいずれも無し）は text record（content 非null必須の
  // CHECK 制約 records_text_content_check）に違反し RPC のトランザクション全体を abort
  // させるため、ここで行エラーとして弾く（画像あり・本文空は image record として正当なので通す）
  if (images.length === 0 && remoteImageUrls.length === 0 && content === null) {
    throw new EmlImportError(`${filename}: 本文が空のため取り込めません`);
  }

  const mailKey = await deriveMailKey(email.messageId, rawArrayBuffer);

  return {
    senderAddress,
    postedAt,
    title,
    content,
    images,
    remoteImageUrls,
    mailKey,
  };
}

// --- ParsedEmlMessage → TalkImportRecord[] 展開（#133） ---

/** expandEmlMessageToRecords が返す各レコードのメディア添付元 */
export type EmlMediaSource =
  | { kind: "attachment"; data: Uint8Array; mimeType: string; filename: string }
  | { kind: "remote"; url: string };

/** expandEmlMessageToRecords の戻り値の1要素（作成すべき record と、その添付元） */
export type EmlImportUnit = {
  record: TalkImportRecord;
  media: EmlMediaSource | null;
};

/**
 * ParsedEmlMessage を、作成すべき TalkImportRecord（と、そのメディア添付元）の配列に
 * 展開する（#133: 1通のメールに複数画像がある場合、全件を登録する）。
 *
 * - 画像（添付 or リモート）が無ければ、本文を持つ text record 1件のみを返す
 * - 画像がある場合、mediaSources（添付があれば添付の全件、無ければリモート URL の全件）の
 *   各要素につき1件の image record を作る。1件目（index 0）だけが本文（content）を持ち、
 *   タイトルは全件で共通（Subject をそのまま使い回す）。2件目以降は独立した画像レコードとして
 *   content を null にする
 * - importKey は `${message.mailKey}#${index}`（index は展開後のこの配列内での連番、
 *   0始まり）。.eml インポートの重複排除はこの importKey で行う（本文プレフィックスベースの
 *   判定では、同一メールから作られる複数レコードが同一 participant/postedAt/type を持つため
 *   区別できないケースがあるため、#133）。mailKey はファイル名ではなくメールの識別情報
 *   （Message-ID、無ければ本文ハッシュ）から導出されるため、同名だが別内容のメールが
 *   衝突したり、リネームで再インポート時に重複と判定されなくなったりしない（P1-2）
 * - 画像の実データ・URL はここでは扱わない（record 作成後に呼び出し側が
 *   attachRecordMedia / fetchRemoteImagesForImport で添付する）
 */
export function expandEmlMessageToRecords(
  message: ParsedEmlMessage,
): EmlImportUnit[] {
  const mediaSources: EmlMediaSource[] =
    message.images.length > 0
      ? message.images.map((image) => ({
          kind: "attachment" as const,
          data: image.data,
          mimeType: image.mimeType,
          filename: image.filename,
        }))
      : message.remoteImageUrls.map((url) => ({ kind: "remote" as const, url }));

  if (mediaSources.length === 0) {
    return [
      {
        record: {
          speaker: message.senderAddress,
          postedAt: message.postedAt,
          type: "text",
          title: message.title,
          content: message.content,
          hasAudio: false,
          importKey: `${message.mailKey}#0`,
        },
        media: null,
      },
    ];
  }

  return mediaSources.map((media, index) => ({
    record: {
      speaker: message.senderAddress,
      postedAt: message.postedAt,
      type: "image",
      title: message.title,
      content: index === 0 ? message.content : null,
      hasAudio: false,
      importKey: `${message.mailKey}#${index}`,
    },
    media,
  }));
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
 * リモート画像取得の失敗理由（#132 レビュー対応 P1-3）
 * URL や image_name 等の個人情報を含み得る情報はここに含めない。ログに出す場合は
 * この理由コードのみを出力し、message.remoteImageUrl 自体は出力しないこと
 */
export type RemoteImageImportFailureReason =
  | "not_allowed" // URL が許可リストの再検証に失敗した
  | "fetch_failed" // repository での取得に失敗した（ネットワーク・http_error・too_large・no_body）
  | "not_image" // Content-Type が image/ 始まりでない
  | "batch_size_exceeded"; // バッチ合計サイズの上限に達した

export type RemoteImageImportResult =
  | { ok: true; image: FetchedRemoteImage }
  | { ok: false; reason: RemoteImageImportFailureReason };

/**
 * .eml インポート用にリモート画像をまとめて取得する（#129、#132 レビュー対応 P1-3/P2-1/P2-2）
 * - fetchOne は repository（fetchRemoteImage）を呼ぶ前に必ず isAllowedRemoteImageUrl で
 *   URL を再検証する（P2-1: SSRF チェックの自己完結性。呼び出し元の事前フィルタに
 *   依存せず、許可外 URL に対して outbound I/O を一切行わない）
 * - 1件あたり MAX_EML_FILE_SIZE（10MB）・タイムアウト15秒で repository の
 *   fetchRemoteImage を呼ぶ
 * - 同時実行数 REMOTE_IMAGE_FETCH_CONCURRENCY（5）のワーカープールで並列化する。
 *   このため最大 REMOTE_IMAGE_FETCH_CONCURRENCY 件が同時に進行中になり得て、
 *   バッチ合計サイズの上限（MAX_EML_TOTAL_SIZE）チェックが効くまでの間に、実際に
 *   ダウンロードされるバイト数は上限を最大 (REMOTE_IMAGE_FETCH_CONCURRENCY - 1) ×
 *   MAX_EML_FILE_SIZE（約40MB）超過し得る（同時実行中のタスクは上限到達を検知
 *   できないまま最後まで読み切るため）
 * - ダウンロードした全バイト数（非画像コンテンツを含む）を Content-Type 判定より
 *   前に合計へ加算する（P2-2: 非画像コンテンツの大量ダウンロードでバッチ上限を
 *   迂回できてしまう不具合の修正）。合計が MAX_EML_TOTAL_SIZE（50MB）を超えた時点で、
 *   当該タスクと以降のタスクは batch_size_exceeded にする
 * - Content-Type はメディアタイプのみに正規化（`;` 以降除去・trim・小文字化）し、
 *   `image/` 始まりでなければ not_image。filename は正規化後の subtype から導出する
 * - 戻り値は task.key → RemoteImageImportResult の Map。呼び出し元は ok: false を
 *   添付失敗として扱う（メディア未添付レコードとして残る）。reason は個人情報を
 *   含まないため、そのままログへ出力してよい
 */
export async function fetchRemoteImagesForImport(
  tasks: RemoteImageFetchTask[],
): Promise<Map<string, RemoteImageImportResult>> {
  const results = new Map<string, RemoteImageImportResult>();
  let totalFetchedBytes = 0;
  let isTotalSizeExceeded = false;
  let nextTaskIndex = 0;

  async function fetchOne(url: string): Promise<RemoteImageImportResult> {
    // P2-1: repository を呼ぶ前に必ず許可リストを再検証する。呼び出し元
    // （action 層）がすでに許可済み URL のみをタスク化していたとしても、この
    // 関数単体で SSRF チェックが完結しているようにする
    if (!isAllowedRemoteImageUrl(url)) {
      return { ok: false, reason: "not_allowed" };
    }

    const fetched = await fetchRemoteImage(url, {
      timeoutMs: REMOTE_IMAGE_FETCH_TIMEOUT_MS,
      maxBytes: MAX_EML_FILE_SIZE,
    });
    if (!fetched.ok) {
      return { ok: false, reason: "fetch_failed" };
    }

    // P2-2: 非画像コンテンツのバイト数もバッチ合計に含めてから上限判定する
    totalFetchedBytes += fetched.data.byteLength;
    if (totalFetchedBytes > MAX_EML_TOTAL_SIZE) {
      isTotalSizeExceeded = true;
      return { ok: false, reason: "batch_size_exceeded" };
    }

    const contentType = fetched.contentType.split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      return { ok: false, reason: "not_image" };
    }

    return {
      ok: true,
      image: {
        data: fetched.data,
        contentType,
        filename: guessImageFilename(contentType, 0),
      },
    };
  }

  async function runWorker(): Promise<void> {
    while (nextTaskIndex < tasks.length) {
      const task = tasks[nextTaskIndex];
      nextTaskIndex += 1;
      if (isTotalSizeExceeded) {
        results.set(task.key, { ok: false, reason: "batch_size_exceeded" });
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
