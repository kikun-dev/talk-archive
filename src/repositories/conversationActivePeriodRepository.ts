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

export async function createConversationActivePeriods(
  client: SupabaseClient<Database>,
  params: Array<{
    conversationId: string;
    startDate: string;
    endDate?: string | null;
  }>,
): Promise<ConversationActivePeriod[]> {
  if (params.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("conversation_active_periods")
    .insert(
      params.map((period) => ({
        conversation_id: period.conversationId,
        start_date: period.startDate,
        end_date: period.endDate ?? null,
      })),
    )
    .select();

  if (error) {
    throw error;
  }

  return data.map(toConversationActivePeriod);
}

export async function replaceConversationActivePeriods(
  client: SupabaseClient<Database>,
  conversationId: string,
  params: Array<{
    startDate: string;
    endDate?: string | null;
  }>,
): Promise<ConversationActivePeriod[]> {
  const { error } = await client
    .from("conversation_active_periods")
    .delete()
    .eq("conversation_id", conversationId);

  if (error) {
    throw error;
  }

  return createConversationActivePeriods(
    client,
    params.map((period) => ({
      conversationId,
      startDate: period.startDate,
      endDate: period.endDate,
    })),
  );
}
