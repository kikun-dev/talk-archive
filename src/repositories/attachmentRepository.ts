import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Attachment, MediaAttachment, RecordType } from "@/types/domain";

type AttachmentRow = Database["public"]["Tables"]["attachments"]["Row"];
type RecordRow = Database["public"]["Tables"]["records"]["Row"];
type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];
type AttachmentWithRecordRow = AttachmentRow & {
  records: Pick<RecordRow, "conversation_id" | "record_type"> & {
    conversations: Pick<ConversationRow, "user_id">;
  };
};

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    recordId: row.record_id,
    filePath: row.file_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
  };
}

function toMediaAttachment(row: AttachmentWithRecordRow): MediaAttachment {
  return {
    ...toAttachment(row),
    conversationId: row.records.conversation_id,
  };
}

export async function getAttachmentsByRecord(
  client: SupabaseClient<Database>,
  recordId: string,
): Promise<Attachment[]> {
  const { data, error } = await client
    .from("attachments")
    .select("*")
    .eq("record_id", recordId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(toAttachment);
}

export async function getAttachmentsByType(
  client: SupabaseClient<Database>,
  userId: string,
  recordType: RecordType,
  options?: { limit?: number; offset?: number },
): Promise<MediaAttachment[]> {
  let query = client
    .from("attachments")
    .select(
      "*, records!inner(conversation_id, record_type, conversations!inner(user_id))",
    )
    .eq("records.conversations.user_id", userId)
    .eq("records.record_type", recordType)
    .order("created_at", { ascending: false });

  if (options?.limit !== undefined) {
    query = query.limit(options.limit);
  }
  if (options?.offset !== undefined) {
    query = query.range(
      options.offset,
      options.offset + (options?.limit ?? 20) - 1,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data.map((row) => toMediaAttachment(row as AttachmentWithRecordRow));
}

export async function createAttachment(
  client: SupabaseClient<Database>,
  params: {
    recordId: string;
    filePath: string;
    mimeType: string;
    fileSize: number;
  },
): Promise<Attachment> {
  const { data, error } = await client
    .from("attachments")
    .insert({
      record_id: params.recordId,
      file_path: params.filePath,
      mime_type: params.mimeType,
      file_size: params.fileSize,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toAttachment(data);
}

export async function deleteAttachment(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("attachments")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
