import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Source } from "@/types/domain";
import { getSources } from "@/repositories/sourceRepository";

export async function listSources(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Source[]> {
  return getSources(client, userId);
}
