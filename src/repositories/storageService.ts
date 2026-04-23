import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const BUCKET_NAME = "media";

/** Signed URL の有効期限（秒） */
const SIGNED_URL_EXPIRY_SECONDS = 3600;

type SignedUrlBatchItem = {
  error: string | null;
  path: string | null;
  signedUrl: string | null;
};

/**
 * Storage パスを生成する
 * 規約: {userId}/{conversationId}/{recordId}/{filename}
 */
export function buildStoragePath(params: {
  userId: string;
  conversationId: string;
  recordId: string;
  filename: string;
}): string {
  return `${params.userId}/${params.conversationId}/${params.recordId}/${params.filename}`;
}

/**
 * 参加者サムネイルの Storage パスを生成する
 * 規約: {userId}/participants/{participantId}/{filename}
 */
export function buildParticipantThumbnailPath(params: {
  userId: string;
  participantId: string;
  filename: string;
}): string {
  return `${params.userId}/participants/${params.participantId}/${params.filename}`;
}

/**
 * 会話一覧カバー画像の Storage パスを生成する
 */
export function buildConversationCoverPath(params: {
  userId: string;
  conversationId: string;
  filename: string;
}): string {
  return `${params.userId}/conversations/${params.conversationId}/cover/${params.filename}`;
}

export function isStorageFilePath(path: string | null): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.startsWith("http://") &&
    !path.startsWith("https://")
  );
}

/**
 * ファイルを Supabase Storage にアップロードする
 */
export async function uploadFile(
  client: SupabaseClient<Database>,
  params: {
    path: string;
    file: File | Blob;
    contentType: string;
    upsert?: boolean;
  },
): Promise<string> {
  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .upload(params.path, params.file, {
      contentType: params.contentType,
      upsert: params.upsert ?? false,
    });

  if (error) {
    throw error;
  }

  return data.path;
}

/**
 * Signed URL を取得する（期限付き）
 */
export async function getFileUrl(
  client: SupabaseClient<Database>,
  path: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

/**
 * 複数ファイルの Signed URL を一括取得する
 */
export async function getFileUrls(
  client: SupabaseClient<Database>,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) {
    return new Map();
  }

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

  if (error) {
    throw error;
  }

  const map = new Map<string, string>();
  for (const item of data as SignedUrlBatchItem[]) {
    const path = item.path ?? "unknown";

    if (item.error) {
      throw new Error(`Signed URL generation failed for ${path}: ${item.error}`);
    }

    if (!item.path || !item.signedUrl) {
      throw new Error(`Signed URL response was incomplete for ${path}`);
    }

    map.set(item.path, item.signedUrl);
  }
  return map;
}

/**
 * ファイルを Storage から削除する
 */
export async function deleteFile(
  client: SupabaseClient<Database>,
  path: string,
): Promise<void> {
  const { error } = await client.storage.from(BUCKET_NAME).remove([path]);

  if (error) {
    throw error;
  }
}

/**
 * 複数ファイルを Storage から一括削除する
 */
export async function deleteFiles(
  client: SupabaseClient<Database>,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  const { error } = await client.storage.from(BUCKET_NAME).remove(paths);

  if (error) {
    throw error;
  }
}
