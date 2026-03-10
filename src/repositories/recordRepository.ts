import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Record, RecordType } from "@/types/domain";

type RecordRow = Database["public"]["Tables"]["records"]["Row"];

function toRecord(row: RecordRow): Record {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    recordType: row.record_type as RecordType,
    title: row.title,
    content: row.content,
    hasAudio: row.has_audio,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getRecordsByConversation(
  client: SupabaseClient<Database>,
  conversationId: string,
): Promise<Record[]> {
  const { data, error } = await client
    .from("records")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(toRecord);
}

export async function getRecord(
  client: SupabaseClient<Database>,
  id: string,
): Promise<Record | null> {
  const { data, error } = await client
    .from("records")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toRecord(data) : null;
}

export async function createRecord(
  client: SupabaseClient<Database>,
  params: {
    conversationId: string;
    recordType: RecordType;
    title?: string | null;
    content?: string | null;
    hasAudio?: boolean;
    position?: number;
  },
): Promise<Record> {
  const { data, error } = await client
    .from("records")
    .insert({
      conversation_id: params.conversationId,
      record_type: params.recordType,
      title: params.title ?? null,
      content: params.content ?? null,
      has_audio: params.hasAudio ?? false,
      position: params.position ?? 0,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toRecord(data);
}

export async function createTextRecordAtNextPosition(
  client: SupabaseClient<Database>,
  params: {
    conversationId: string;
    title: string | null;
    content: string;
  },
): Promise<Record> {
  const { data, error } = await client
    .rpc("append_text_record", {
      p_conversation_id: params.conversationId,
      p_title: params.title,
      p_content: params.content,
    })
    .single();

  if (error) {
    throw error;
  }

  return toRecord(data);
}

export async function updateRecord(
  client: SupabaseClient<Database>,
  id: string,
  params: {
    title?: string | null;
    content?: string | null;
    hasAudio?: boolean;
    position?: number;
  },
): Promise<Record> {
  const updateData: Database["public"]["Tables"]["records"]["Update"] = {};
  if (params.title !== undefined) {
    updateData.title = params.title;
  }
  if (params.content !== undefined) {
    updateData.content = params.content;
  }
  if (params.hasAudio !== undefined) {
    updateData.has_audio = params.hasAudio;
  }
  if (params.position !== undefined) {
    updateData.position = params.position;
  }

  const { data, error } = await client
    .from("records")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toRecord(data);
}

export async function deleteRecord(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("records")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function searchRecords(
  client: SupabaseClient<Database>,
  userId: string,
  query: string,
): Promise<Record[]> {
  const { data, error } = await client
    .from("records")
    .select("*, conversations!inner(user_id)")
    .eq("conversations.user_id", userId)
    .ilike("content", `%${query}%`)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data.map((row) => toRecord(row as unknown as RecordRow));
}
