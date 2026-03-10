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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseActivePeriods(
  value: string,
): Array<{ startDate: string; endDate?: string | null }> | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const activePeriods: Array<{ startDate: string; endDate?: string | null }> =
    [];

  for (const period of parsed) {
    if (!isRecord(period) || typeof period.startDate !== "string") {
      return null;
    }

    if (
      period.endDate !== undefined &&
      period.endDate !== null &&
      typeof period.endDate !== "string"
    ) {
      return null;
    }

    activePeriods.push({
      startDate: period.startDate,
      endDate:
        period.endDate === undefined
          ? undefined
          : (period.endDate as string | null),
    });
  }

  return activePeriods;
}

function parseParticipants(value: string): Array<{ name: string }> | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const participants: Array<{ name: string }> = [];

  for (const participant of parsed) {
    if (!isRecord(participant) || typeof participant.name !== "string") {
      return null;
    }

    participants.push({ name: participant.name });
  }

  return participants;
}

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
  const activePeriodsJson = formData.get("activePeriods") as string;
  const participantsJson = formData.get("participants") as string;

  const activePeriods = parseActivePeriods(activePeriodsJson);
  if (!activePeriods) {
    return { error: "会話期間のデータが不正です" };
  }

  const participants = parseParticipants(participantsJson);
  if (!participants) {
    return { error: "参加者のデータが不正です" };
  }

  const input = {
    userId: user.id,
    title,
    idolGroup: idolGroup as IdolGroup,
    activePeriods,
    participants,
  };

  const validationError = validateCreateConversationInput(input);
  if (validationError) {
    return { error: validationError };
  }

  const conversation = await createNewConversation(supabase, input);

  redirect(`/conversations/${conversation.id}`);
}
