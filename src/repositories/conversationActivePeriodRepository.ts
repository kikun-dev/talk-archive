import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ConversationActivePeriod } from "@/types/domain";

type ConversationActivePeriodRow =
  Database["public"]["Tables"]["conversation_active_periods"]["Row"];

function toConversationActivePeriod(
  row: ConversationActivePeriodRow,
): ConversationActivePeriod {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
  };
}

export async function getConversationActivePeriods(
  client: SupabaseClient<Database>,
  conversationId: string,
): Promise<ConversationActivePeriod[]> {
  const { data, error } = await client
    .from("conversation_active_periods")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("start_date", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(toConversationActivePeriod);
}

export async function listConversationActivePeriods(
  client: SupabaseClient<Database>,
  conversationIds: string[],
): Promise<ConversationActivePeriod[]> {
  if (conversationIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("conversation_active_periods")
    .select("*")
    .in("conversation_id", conversationIds)
    .order("start_date", { ascending: true });

  if (error) {
    throw error;
  }

  return data.map(toConversationActivePeriod);
}
