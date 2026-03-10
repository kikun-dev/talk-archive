import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Conversation } from "@/types/domain";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    sourceId: row.source_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConversations(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Conversation[]> {
  const { data, error } = await client
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data.map(toConversation);
}

export async function getConversation(
  client: SupabaseClient<Database>,
  id: string,
): Promise<Conversation | null> {
  const { data, error } = await client
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toConversation(data) : null;
}

export async function createConversation(
  client: SupabaseClient<Database>,
  params: { userId: string; title: string; sourceId?: string | null },
): Promise<Conversation> {
  const { data, error } = await client
    .from("conversations")
    .insert({
      user_id: params.userId,
      title: params.title,
      source_id: params.sourceId ?? null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toConversation(data);
}

export async function updateConversation(
  client: SupabaseClient<Database>,
  id: string,
  params: { title?: string; sourceId?: string | null },
): Promise<Conversation> {
  const updateData: Database["public"]["Tables"]["conversations"]["Update"] =
    {};
  if (params.title !== undefined) {
    updateData.title = params.title;
  }
  if (params.sourceId !== undefined) {
    updateData.source_id = params.sourceId;
  }

  const { data, error } = await client
    .from("conversations")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toConversation(data);
}

export async function deleteConversation(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("conversations")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
