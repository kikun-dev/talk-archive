"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  updateDisplayName,
  validateDisplayName,
} from "@/usecases/userSettingsUseCases";

export type SettingsActionState =
  | {
      error?: string;
      success?: boolean;
    }
  | undefined;

export async function updateDisplayNameAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = formData.get("displayName");
  if (typeof displayName !== "string") {
    return { error: "表示名のデータが不正です" };
  }

  const validationError = validateDisplayName(displayName);
  if (validationError) {
    return { error: validationError };
  }

  try {
    await updateDisplayName(supabase, user.id, displayName);
  } catch (error) {
    console.error("Failed to update display name:", error);
    return { error: "表示名の更新に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath("/", "layout");

  return { success: true };
}
