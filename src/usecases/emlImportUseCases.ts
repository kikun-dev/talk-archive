import PostalMime from "postal-mime";
import type { Address, Email } from "postal-mime";
import type { TalkImportRecord } from "@/usecases/importUseCases";

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
  /** 2枚目以降の画像枚数（取り込み対象外の警告用） */
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

function normalizeTitle(subject: string | undefined): string | null {
  if (subject === undefined) {
    return null;
  }
  const trimmed = subject.trim();
  if (trimmed.length === 0 || trimmed === "無題") {
    return null;
  }
  return trimmed.slice(0, MAX_TITLE_LENGTH);
}

// html-entities.js は postal-mime の公開 API（package.json の exports）に含まれず
// 深いパスからの import はできないため、フォールバック用に最小限のデコードを自前で持つ
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
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

function normalizeContent(
  text: string | undefined,
  html: string | undefined,
): string | null {
  if (typeof text === "string" && text.trim().length > 0) {
    return text.trim();
  }
  if (typeof html === "string") {
    const fromHtml = htmlToText(html).trim();
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

function guessImageFilename(mimeType: string, index: number): string {
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
  const content = normalizeContent(email.text, email.html);
  const { image, extraImageCount } = extractImage(email.attachments);

  // 本文空・画像なしは text record（content 非null必須の CHECK 制約
  // records_text_content_check）に違反し RPC のトランザクション全体を abort させるため、
  // ここで行エラーとして弾く（画像あり・本文空は image record として正当なので通す）
  if (image === null && content === null) {
    throw new EmlImportError(`${filename}: 本文が空のため取り込めません`);
  }

  return {
    senderAddress,
    postedAt,
    title,
    content,
    image,
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
    type: message.image ? "image" : "text",
    title: message.title,
    content: message.content,
    hasAudio: false,
  };
}
