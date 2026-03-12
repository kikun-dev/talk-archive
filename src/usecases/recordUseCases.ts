import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Record, Attachment, RecordType } from "@/types/domain";
import {
  createTextRecordAtNextPosition,
  createMediaRecordAtNextPosition,
  updateRecord,
  deleteRecord,
} from "@/repositories/recordRepository";
import {
  createAttachment,
  getAttachmentsByRecordIds,
} from "@/repositories/attachmentRepository";
import {
  buildStoragePath,
  uploadFile,
  getFileUrl,
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

  const results = await Promise.all(
    mediaRecords.map(async (record) => {
      const attachment = firstAttachmentByRecordId.get(record.id);
      if (!attachment) {
        return null;
      }
      const url = await getFileUrl(client, attachment.filePath);
      return {
        recordId: record.id,
        mediaUrl: { url, mimeType: attachment.mimeType },
      };
    }),
  );

  const map = new Map<string, MediaUrl>();
  for (const result of results) {
    if (result) {
      map.set(result.recordId, result.mediaUrl);
    }
  }
  return map;
}
