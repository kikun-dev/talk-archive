import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ConversationParticipant } from "@/types/domain";

type ConversationParticipantRow =
  Database["public"]["Tables"]["conversation_participants"]["Row"];

function toConversationParticipant(
  row: ConversationParticipantRow,
): ConversationParticipant {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function getConversationParticipants(
  client: SupabaseClient<Database>,
  conversationId: string,
): Promise<ConversationParticipant[]> {
  const { data, error } = await client
    .from("conversation_participants")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(toConversationParticipant);
}
