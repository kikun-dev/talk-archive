import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SearchRecordResult } from "@/types/domain";
import { searchRecords as searchRecordsInRepository } from "@/repositories/recordRepository";

export type SearchRecordsInput = {
  userId: string;
  query: string;
  conversationId?: string;
};

export function sanitizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").replace(/[\\%_]/g, "\\$&");
}

export async function searchRecords(
  client: SupabaseClient<Database>,
  input: SearchRecordsInput,
): Promise<SearchRecordResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(input.query);

  if (sanitizedQuery.length === 0) {
    return [];
  }

  const conversationId = input.conversationId?.trim();

  return searchRecordsInRepository(client, {
    userId: input.userId,
    query: sanitizedQuery,
    conversationId:
      conversationId !== undefined && conversationId.length > 0
        ? conversationId
        : undefined,
  });
}
