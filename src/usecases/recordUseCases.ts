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
  getAttachmentsByRecord,
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
};

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
  });
}

export type UpdateRecordInput = {
  title?: string | null;
  content?: string | null;
};

export function validateUpdateRecordInput(
  input: UpdateRecordInput,
): string | null {
  if (input.title === undefined && input.content === undefined) {
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

  const results = await Promise.all(
    mediaRecords.map(async (record) => {
      const attachments = await getAttachmentsByRecord(client, record.id);
      if (attachments.length === 0) {
        return null;
      }
      const attachment = attachments[0];
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
