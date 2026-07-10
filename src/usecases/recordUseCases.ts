import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Record, Attachment, RecordType } from "@/types/domain";
import {
  createTextRecordAtNextPosition,
  createMediaRecordAtNextPosition,
  getMediaRecordsByConversation,
  getRecord,
  getRecordsByConversationAndDateRange,
  updateRecord,
  deleteRecord,
} from "@/repositories/recordRepository";
import {
  createAttachment,
  getAttachmentsByRecord,
  getAttachmentsByRecordIds,
} from "@/repositories/attachmentRepository";
import {
  buildStoragePath,
  uploadFile,
  getFileUrls,
  deleteFile,
} from "@/repositories/storageService";

export type AddTextRecordInput = {
  conversationId: string;
  title?: string | null;
  content: string;
  speakerParticipantId: string;
  postedAt: string;
};

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isValidPostedAt(value: string): boolean {
  return value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

export function validateAddTextRecordInput(
  input: AddTextRecordInput,
): string | null {
  const trimmedContent = input.content.trim();
  if (trimmedContent.length === 0) {
    return "テキストを入力してください";
  }

  if (input.title !== undefined && input.title !== null) {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length > 200) {
      return "タイトルは200文字以内で入力してください";
    }
  }

  if (!isValidUuid(input.speakerParticipantId.trim())) {
    return "発言者を正しく選択してください";
  }

  if (!isValidPostedAt(input.postedAt.trim())) {
    return "投稿日時が不正です";
  }

  return null;
}

export async function addTextRecord(
  client: SupabaseClient<Database>,
  input: AddTextRecordInput,
): Promise<Record> {
  const validationError = validateAddTextRecordInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return createTextRecordAtNextPosition(client, {
    conversationId: input.conversationId,
    title: input.title?.trim() ?? null,
    content: input.content.trim(),
    speakerParticipantId: input.speakerParticipantId.trim(),
    postedAt: input.postedAt.trim(),
  });
}

export type UpdateRecordInput = {
  title?: string | null;
  content?: string | null;
  speakerParticipantId?: string;
  postedAt?: string;
};

export function validateUpdateRecordInput(
  input: UpdateRecordInput,
): string | null {
  if (
    input.title === undefined &&
    input.content === undefined &&
    input.speakerParticipantId === undefined &&
    input.postedAt === undefined
  ) {
    return "更新項目を指定してください";
  }

  if (input.title !== undefined && input.title !== null) {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length > 200) {
      return "タイトルは200文字以内で入力してください";
    }
  }

  if (input.content !== undefined && input.content !== null) {
    const trimmedContent = input.content.trim();
    if (trimmedContent.length === 0) {
      return "テキストを入力してください";
    }
  }
  if (input.content === null) {
    return "テキストを入力してください";
  }

  if (
    input.speakerParticipantId !== undefined &&
    !isValidUuid(input.speakerParticipantId.trim())
  ) {
    return "発言者を正しく選択してください";
  }

  if (
    input.postedAt !== undefined &&
    !isValidPostedAt(input.postedAt.trim())
  ) {
    return "投稿日時が不正です";
  }

  return null;
}

export async function updateExistingRecord(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateRecordInput,
): Promise<Record> {
  const validationError = validateUpdateRecordInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return updateRecord(client, id, {
    title: input.title !== undefined ? (input.title?.trim() ?? null) : undefined,
    content:
      input.content !== undefined
        ? (input.content?.trim() ?? null)
        : undefined,
    speakerParticipantId:
      input.speakerParticipantId !== undefined
        ? input.speakerParticipantId.trim()
        : undefined,
    postedAt: input.postedAt !== undefined ? input.postedAt.trim() : undefined,
  });
}

export async function deleteExistingRecord(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteRecord(client, id);
}

// --- メディアレコード ---

export type AddMediaRecordInput = {
  userId: string;
  conversationId: string;
  title?: string | null;
  content?: string | null;
  file: File | Blob;
  filename: string;
  contentType: string;
  speakerParticipantId: string;
  postedAt: string;
};

export type AddVideoRecordInput = AddMediaRecordInput & {
  hasAudio: boolean;
};

export type MediaRecordResult = {
  record: Record;
  attachment: Attachment;
};

export function validateAddMediaRecordInput(
  input: AddMediaRecordInput,
): string | null {
  if (input.title !== undefined && input.title !== null) {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length > 200) {
      return "タイトルは200文字以内で入力してください";
    }
  }

  if (input.filename.trim().length === 0) {
    return "ファイル名を指定してください";
  }

  if (input.contentType.trim().length === 0) {
    return "コンテンツタイプを指定してください";
  }

  if (!isValidUuid(input.speakerParticipantId.trim())) {
    return "発言者を正しく選択してください";
  }

  if (!isValidPostedAt(input.postedAt.trim())) {
    return "投稿日時が不正です";
  }

  return null;
}

/**
 * メディアレコードを作成する共通処理
 * 1. DB 側で position を原子的に採番しながらレコード作成
 * 2. ファイルアップロード
 * 3. Attachment メタデータ作成
 *
 * アップロードまたは Attachment 作成に失敗した場合、レコードをロールバック（削除）する
 */
async function createMediaRecord(
  client: SupabaseClient<Database>,
  recordType: Exclude<RecordType, "text">,
  input: AddMediaRecordInput,
  options?: { hasAudio?: boolean },
): Promise<MediaRecordResult> {
  const validationError = validateAddMediaRecordInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const record = await createMediaRecordAtNextPosition(client, {
    conversationId: input.conversationId,
    recordType,
    title: input.title?.trim() ?? null,
    content: input.content?.trim() ?? null,
    hasAudio: options?.hasAudio ?? false,
    speakerParticipantId: input.speakerParticipantId.trim(),
    postedAt: input.postedAt.trim(),
  });

  const storagePath = buildStoragePath({
    userId: input.userId,
    conversationId: input.conversationId,
    recordId: record.id,
    filename: input.filename,
  });

  let uploadedPath: string;
  try {
    uploadedPath = await uploadFile(client, {
      path: storagePath,
      file: input.file,
      contentType: input.contentType,
    });
  } catch (uploadError) {
    await deleteRecord(client, record.id);
    throw uploadError;
  }

  let attachment: Attachment;
  try {
    attachment = await createAttachment(client, {
      recordId: record.id,
      filePath: uploadedPath,
      mimeType: input.contentType,
      fileSize: input.file.size,
    });
  } catch (attachmentError) {
    await deleteFile(client, uploadedPath).catch(() => {});
    await deleteRecord(client, record.id);
    throw attachmentError;
  }

  return { record, attachment };
}

// --- メディア未添付レコード（#113） ---
// attachment が 0 件のメディアレコードを「未添付」とみなす（状態カラムは持たない）

export type AddPendingMediaRecordInput = {
  conversationId: string;
  recordType: Exclude<RecordType, "text">;
  title?: string | null;
  content?: string | null;
  hasAudio?: boolean;
  speakerParticipantId: string;
  postedAt: string;
};

export function validateAddPendingMediaRecordInput(
  input: AddPendingMediaRecordInput,
): string | null {
  if (input.title !== undefined && input.title !== null) {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length > 200) {
      return "タイトルは200文字以内で入力してください";
    }
  }

  if (!isValidUuid(input.speakerParticipantId.trim())) {
    return "発言者を正しく選択してください";
  }

  if (!isValidPostedAt(input.postedAt.trim())) {
    return "投稿日時が不正です";
  }

  return null;
}

export async function addPendingMediaRecord(
  client: SupabaseClient<Database>,
  input: AddPendingMediaRecordInput,
): Promise<Record> {
  const validationError = validateAddPendingMediaRecordInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return createMediaRecordAtNextPosition(client, {
    conversationId: input.conversationId,
    recordType: input.recordType,
    title: input.title?.trim() ?? null,
    content: input.content?.trim() ?? null,
    hasAudio: input.hasAudio ?? false,
    speakerParticipantId: input.speakerParticipantId.trim(),
    postedAt: input.postedAt.trim(),
  });
}

export type AttachRecordMediaInput = {
  userId: string;
  recordId: string;
  file: File | Blob;
  filename: string;
  contentType: string;
};

/**
 * 添付操作のユーザー向けエラー
 * action 層はこのエラーの message をそのまま画面に返してよい
 */
export class AttachMediaError extends Error {}

const MAX_ATTACH_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACH_MEDIA_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const MEDIA_TYPE_RULES: {
  [key in Exclude<RecordType, "text">]: {
    mimePrefix: string;
    maxFileSize: number;
    mismatchError: string;
    sizeError: string;
  };
} = {
  image: {
    mimePrefix: "image/",
    maxFileSize: MAX_ATTACH_IMAGE_FILE_SIZE,
    mismatchError: "画像ファイルを選択してください",
    sizeError: "ファイルサイズは10MB以内にしてください",
  },
  video: {
    mimePrefix: "video/",
    maxFileSize: MAX_ATTACH_MEDIA_FILE_SIZE,
    mismatchError: "動画ファイルを選択してください",
    sizeError: "ファイルサイズは50MB以内にしてください",
  },
  audio: {
    mimePrefix: "audio/",
    maxFileSize: MAX_ATTACH_MEDIA_FILE_SIZE,
    mismatchError: "音声ファイルを選択してください",
    sizeError: "ファイルサイズは50MB以内にしてください",
  },
};

function isMediaRecordType(
  recordType: RecordType,
): recordType is Exclude<RecordType, "text"> {
  return recordType !== "text";
}

export function validateAttachRecordMediaInput(
  input: AttachRecordMediaInput,
): string | null {
  if (input.filename.trim().length === 0) {
    return "ファイル名を指定してください";
  }

  if (input.contentType.trim().length === 0) {
    return "コンテンツタイプを指定してください";
  }

  return null;
}

/**
 * 未添付のメディアレコードにファイルを添付する
 * 1. レコードの存在・種別・未添付を確認
 * 2. ファイルアップロード
 * 3. Attachment メタデータ作成
 *
 * Attachment 作成に失敗した場合、アップロード済みファイルは削除するが
 * レコードは既存のものなので削除しない（createMediaRecord との違い）
 */
export async function attachRecordMedia(
  client: SupabaseClient<Database>,
  input: AttachRecordMediaInput,
): Promise<MediaRecordResult> {
  const validationError = validateAttachRecordMediaInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const record = await getRecord(client, input.recordId);
  if (!record) {
    throw new AttachMediaError("レコードが見つかりません");
  }

  if (!isMediaRecordType(record.recordType)) {
    throw new AttachMediaError("テキストレコードにはメディアを添付できません");
  }

  const rules = MEDIA_TYPE_RULES[record.recordType];
  if (!input.contentType.startsWith(rules.mimePrefix)) {
    throw new AttachMediaError(rules.mismatchError);
  }
  if (input.file.size > rules.maxFileSize) {
    throw new AttachMediaError(rules.sizeError);
  }

  const existingAttachments = await getAttachmentsByRecord(client, record.id);
  if (existingAttachments.length > 0) {
    throw new AttachMediaError(
      "このレコードにはすでにメディアが添付されています",
    );
  }

  const storagePath = buildStoragePath({
    userId: input.userId,
    conversationId: record.conversationId,
    recordId: record.id,
    filename: input.filename,
  });

  const uploadedPath = await uploadFile(client, {
    path: storagePath,
    file: input.file,
    contentType: input.contentType,
  });

  let attachment: Attachment;
  try {
    attachment = await createAttachment(client, {
      recordId: record.id,
      filePath: uploadedPath,
      mimeType: input.contentType,
      fileSize: input.file.size,
    });
  } catch (attachmentError) {
    await deleteFile(client, uploadedPath).catch(() => {});
    throw attachmentError;
  }

  return { record, attachment };
}

/**
 * attachment を持たないメディアレコード（= 未添付）の ID 集合を返す
 */
export async function getPendingMediaRecordIds(
  client: SupabaseClient<Database>,
  records: Record[],
): Promise<Set<string>> {
  const mediaRecords = records.filter((r) =>
    MEDIA_RECORD_TYPES.has(r.recordType),
  );

  if (mediaRecords.length === 0) {
    return new Set();
  }

  const attachments = await getAttachmentsByRecordIds(
    client,
    mediaRecords.map((record) => record.id),
  );
  const attachedRecordIds = new Set(
    attachments.map((attachment) => attachment.recordId),
  );

  return new Set(
    mediaRecords
      .filter((record) => !attachedRecordIds.has(record.id))
      .map((record) => record.id),
  );
}

export async function addImageRecord(
  client: SupabaseClient<Database>,
  input: AddMediaRecordInput,
): Promise<MediaRecordResult> {
  return createMediaRecord(client, "image", input);
}

export async function addVideoRecord(
  client: SupabaseClient<Database>,
  input: AddVideoRecordInput,
): Promise<MediaRecordResult> {
  return createMediaRecord(client, "video", input, {
    hasAudio: input.hasAudio,
  });
}

export async function addAudioRecord(
  client: SupabaseClient<Database>,
  input: AddMediaRecordInput,
): Promise<MediaRecordResult> {
  return createMediaRecord(client, "audio", input);
}

// --- メディア表示 ---

const MEDIA_RECORD_TYPES: ReadonlySet<string> = new Set([
  "image",
  "video",
  "audio",
]);

export type MediaUrl = {
  url: string;
  mimeType: string;
};

/**
 * メディアレコードの Signed URL を一括取得する
 * recordId → MediaUrl のマップを返す
 */
export async function getMediaUrlsForRecords(
  client: SupabaseClient<Database>,
  records: Record[],
): Promise<Map<string, MediaUrl>> {
  const mediaRecords = records.filter((r) =>
    MEDIA_RECORD_TYPES.has(r.recordType),
  );

  if (mediaRecords.length === 0) {
    return new Map();
  }

  const attachments = await getAttachmentsByRecordIds(
    client,
    mediaRecords.map((record) => record.id),
  );
  const firstAttachmentByRecordId = new Map<string, Attachment>();
  for (const attachment of attachments) {
    if (!firstAttachmentByRecordId.has(attachment.recordId)) {
      firstAttachmentByRecordId.set(attachment.recordId, attachment);
    }
  }

  const pathToRecordId = new Map<string, { recordId: string; mimeType: string }>();
  for (const record of mediaRecords) {
    const attachment = firstAttachmentByRecordId.get(record.id);
    if (attachment) {
      pathToRecordId.set(attachment.filePath, {
        recordId: record.id,
        mimeType: attachment.mimeType,
      });
    }
  }

  if (pathToRecordId.size === 0) {
    return new Map();
  }

  const signedUrls = await getFileUrls(client, [...pathToRecordId.keys()]);

  const map = new Map<string, MediaUrl>();
  for (const [path, info] of pathToRecordId) {
    const url = signedUrls.get(path);
    if (url) {
      map.set(info.recordId, { url, mimeType: info.mimeType });
    }
  }
  return map;
}

export function filterMediaRecords(records: Record[]): Record[] {
  return records.filter((r) => MEDIA_RECORD_TYPES.has(r.recordType));
}

export async function listMediaRecordsByConversation(
  client: SupabaseClient<Database>,
  conversationId: string,
): Promise<Record[]> {
  return getMediaRecordsByConversation(client, conversationId);
}

function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function getNextDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function validateDateSearchInput(date: string): string | null {
  if (!isValidDateString(date)) {
    return "日付の形式が不正です";
  }

  return null;
}

export async function getRecordsByDate(
  client: SupabaseClient<Database>,
  conversationId: string,
  date: string,
): Promise<Record[]> {
  const validationError = validateDateSearchInput(date);
  if (validationError) {
    throw new Error(validationError);
  }

  const startJst = `${date}T00:00:00+09:00`;
  const endJst = `${getNextDate(date)}T00:00:00+09:00`;

  return getRecordsByConversationAndDateRange(
    client,
    conversationId,
    startJst,
    endJst,
  );
}
