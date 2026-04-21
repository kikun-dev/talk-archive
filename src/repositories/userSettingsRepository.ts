import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { UserSettings } from "@/types/domain";

type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

function toUserSettings(row: UserSettingsRow): UserSettings {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getUserSettings(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<UserSettings | null> {
  const { data, error } = await client
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toUserSettings(data) : null;
}

export async function upsertUserSettings(
  client: SupabaseClient<Database>,
  userId: string,
  displayName: string,
): Promise<UserSettings> {
  const { data, error } = await client
    .from("user_settings")
    .upsert(
      { user_id: userId, display_name: displayName },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toUserSettings(data);
}
