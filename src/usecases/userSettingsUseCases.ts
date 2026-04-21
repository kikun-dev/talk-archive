import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { UserSettings } from "@/types/domain";
import {
  getUserSettings,
  upsertUserSettings,
} from "@/repositories/userSettingsRepository";

const MAX_DISPLAY_NAME_LENGTH = 50;

export function validateDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return `表示名は${MAX_DISPLAY_NAME_LENGTH}文字以内で入力してください`;
  }
  return null;
}

export async function getDisplayName(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const settings = await getUserSettings(client, userId);
  return settings?.displayName ?? "";
}

export async function updateDisplayName(
  client: SupabaseClient<Database>,
  userId: string,
  displayName: string,
): Promise<UserSettings> {
  const trimmed = displayName.trim();
  const error = validateDisplayName(trimmed);
  if (error) {
    throw new Error(error);
  }
  return upsertUserSettings(client, userId, trimmed);
}
