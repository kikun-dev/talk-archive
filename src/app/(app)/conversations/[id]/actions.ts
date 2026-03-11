"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IdolGroup } from "@/types/domain";
import {
  updateExistingConversation,
  deleteExistingConversation,
  validateUpdateConversationInput,
} from "@/usecases/conversationUseCases";
import {
  addTextRecord,
  validateAddTextRecordInput,
  addImageRecord,
  addVideoRecord,
  validateAddMediaRecordInput,
  updateExistingRecord,
  validateUpdateRecordInput,
  deleteExistingRecord,
} from "@/usecases/recordUseCases";

export type ActionState =
  | {
      error?: string;
    }
  | undefined;

/** @deprecated Use ActionState instead */
export type AddTextRecordState = ActionState;

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

function getOptionalStringField(
  formData: FormData,
  fieldName: string,
): string | null | undefined {
  const value = formData.get(fieldName);

  if (value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }

  return value;
}

function getRequiredStringField(
  formData: FormData,
  fieldName: string,
): string | null {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return null;
  }

  return value;
}

export async function addTextRecordAction(
  conversationId: string,
  _prevState: AddTextRecordState,
  formData: FormData,
): Promise<AddTextRecordState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const titleValue = getOptionalStringField(formData, "title");
  if (titleValue === null) {
    return { error: "タイトルのデータが不正です" };
  }

  const content = getRequiredStringField(formData, "content");
  if (content === null) {
    return { error: "テキストのデータが不正です" };
  }

  const input = {
    conversationId,
    title: titleValue || null,
    content,
  };

  const validationError = validateAddTextRecordInput(input);
  if (validationError) {
    return { error: validationError };
  }

  await addTextRecord(supabase, input);

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function addImageRecordAction(
  conversationId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "画像ファイルを選択してください" };
  }

  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return { error: "ファイルサイズは10MB以内にしてください" };
  }

  if (!file.type.startsWith("image/")) {
    return { error: "画像ファイルを選択してください" };
  }

  const titleValue = getOptionalStringField(formData, "title");
  if (titleValue === null) {
    return { error: "タイトルのデータが不正です" };
  }

  const contentValue = getOptionalStringField(formData, "content");
  if (contentValue === null) {
    return { error: "テキストのデータが不正です" };
  }

  const input = {
    userId: user.id,
    conversationId,
    title: titleValue || null,
    content: contentValue || null,
    file,
    filename: file.name,
    contentType: file.type,
  };

  const validationError = validateAddMediaRecordInput(input);
  if (validationError) {
    return { error: validationError };
  }

  await addImageRecord(supabase, input);

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

const MAX_VIDEO_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function addVideoRecordAction(
  conversationId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "動画ファイルを選択してください" };
  }

  if (file.size > MAX_VIDEO_FILE_SIZE) {
    return { error: "ファイルサイズは50MB以内にしてください" };
  }

  if (!file.type.startsWith("video/")) {
    return { error: "動画ファイルを選択してください" };
  }

  const hasAudioValue = formData.get("hasAudio");
  const hasAudio = hasAudioValue === "true";

  const titleValue = getOptionalStringField(formData, "title");
  if (titleValue === null) {
    return { error: "タイトルのデータが不正です" };
  }

  const input = {
    userId: user.id,
    conversationId,
    title: titleValue || null,
    content: null,
    file,
    filename: file.name,
    contentType: file.type,
    hasAudio,
  };

  const validationError = validateAddMediaRecordInput(input);
  if (validationError) {
    return { error: validationError };
  }

  await addVideoRecord(supabase, input);

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

export async function updateConversationAction(
  conversationId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const title = getRequiredStringField(formData, "title");
  if (title === null) {
    return { error: "タイトルのデータが不正です" };
  }

  const idolGroup = getRequiredStringField(formData, "idolGroup");
  if (idolGroup === null) {
    return { error: "グループのデータが不正です" };
  }

  const activePeriodsJson = getRequiredStringField(formData, "activePeriods");
  if (activePeriodsJson === null) {
    return { error: "会話期間のデータが不正です" };
  }

  const activePeriods = parseActivePeriods(activePeriodsJson);
  if (!activePeriods) {
    return { error: "会話期間のデータが不正です" };
  }

  const participantsJson = getRequiredStringField(formData, "participants");
  if (participantsJson === null) {
    return { error: "参加者のデータが不正です" };
  }

  const participants = parseParticipants(participantsJson);
  if (!participants) {
    return { error: "参加者のデータが不正です" };
  }

  const input = {
    title,
    idolGroup: idolGroup as IdolGroup,
    activePeriods,
    participants,
  };

  const validationError = validateUpdateConversationInput(input);
  if (validationError) {
    return { error: validationError };
  }

  await updateExistingConversation(supabase, conversationId, input);

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

export async function deleteConversationAction(
  conversationId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await deleteExistingConversation(supabase, conversationId);

  redirect("/");
}

export async function updateRecordAction(
  conversationId: string,
  recordId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const titleValue = getOptionalStringField(formData, "title");
  if (titleValue === null) {
    return { error: "タイトルのデータが不正です" };
  }

  const content = getRequiredStringField(formData, "content");
  if (content === null) {
    return { error: "テキストのデータが不正です" };
  }

  const input = {
    title: titleValue === undefined ? undefined : (titleValue || null),
    content,
  };

  const validationError = validateUpdateRecordInput(input);
  if (validationError) {
    return { error: validationError };
  }

  await updateExistingRecord(supabase, recordId, input);

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

export async function deleteRecordAction(
  conversationId: string,
  recordId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await deleteExistingRecord(supabase, recordId);

  revalidatePath(`/conversations/${conversationId}`);
}
