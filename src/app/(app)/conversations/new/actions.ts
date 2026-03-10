"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createNewConversation,
  validateCreateConversationInput,
} from "@/usecases/conversationUseCases";
import type { IdolGroup } from "@/types/domain";

export type CreateConversationState = {
  error?: string;
} | undefined;

export async function createConversationAction(
  _prevState: CreateConversationState,
  formData: FormData,
): Promise<CreateConversationState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const title = formData.get("title") as string;
  const idolGroup = formData.get("idolGroup") as string;
  const sourceId = (formData.get("sourceId") as string) || null;
  const activePeriodsJson = formData.get("activePeriods") as string;

  let activePeriods: Array<{ startDate: string; endDate?: string | null }>;
  try {
    activePeriods = JSON.parse(activePeriodsJson || "[]");
  } catch {
    return { error: "会話期間のデータが不正です" };
  }

  const input = {
    userId: user.id,
    title,
    idolGroup: idolGroup as IdolGroup,
    sourceId,
    activePeriods,
  };

  const validationError = validateCreateConversationInput(input);
  if (validationError) {
    return { error: validationError };
  }

  const conversation = await createNewConversation(supabase, input);

  redirect(`/conversations/${conversation.id}`);
}
