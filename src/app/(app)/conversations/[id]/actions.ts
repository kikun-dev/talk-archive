"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IdolGroup } from "@/types/domain";
import {
  updateExistingConversation,
  deleteExistingConversation,
  validateUpdateConversationInput,
  updateParticipantThumbnailImage,
  validateUpdateParticipantThumbnailInput,
  updateConversationCoverImage,
  validateUpdateConversationCoverImageInput,
} from "@/usecases/conversationUseCases";
import {
  addTextRecord,
  validateAddTextRecordInput,
  addImageRecord,
  addVideoRecord,
  addAudioRecord,
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

function parseParticipants(
  value: string,
): Array<{ id?: string; name: string; thumbnailPath?: string | null }> | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const participants: Array<{
    id?: string;
    name: string;
    thumbnailPath?: string | null;
  }> = [];

  for (const participant of parsed) {
    if (!isRecord(participant) || typeof participant.name !== "string") {
      return null;
    }

    if (
      participant.id !== undefined &&
      participant.id !== null &&
      typeof participant.id !== "string"
    ) {
      return null;
    }

    if (
      participant.thumbnailPath !== undefined &&
      participant.thumbnailPath !== null &&
      typeof participant.thumbnailPath !== "string"
    ) {
      return null;
    }

    participants.push({
      id:
        typeof participant.id === "string" ? participant.id : undefined,
      name: participant.name,
      thumbnailPath:
        participant.thumbnailPath === undefined
          ? undefined
          : (participant.thumbnailPath as string | null),
    });
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

function normalizePostedAtInput(value: string): string | null {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  const localDateTimeMatch = trimmedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/,
  );
  if (localDateTimeMatch) {
    const [
      ,
      year,
      month,
      day,
      hour,
      minute,
      second = "00",
      millisecond = ".000",
    ] = localDateTimeMatch;

    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 9,
        Number(minute),
        Number(second),
        Number(millisecond.slice(1).padEnd(3, "0")),
      ),
    );

    return date.toISOString();
  }

  if (Number.isNaN(Date.parse(trimmedValue))) {
    return null;
  }

  return new Date(trimmedValue).toISOString();
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

  const speakerParticipantId = getRequiredStringField(
    formData,
    "speakerParticipantId",
  );
  if (speakerParticipantId === null) {
    return { error: "発言者のデータが不正です" };
  }

  const postedAt = getRequiredStringField(formData, "postedAt");
  if (postedAt === null) {
    return { error: "投稿日時のデータが不正です" };
  }
  const normalizedPostedAt = normalizePostedAtInput(postedAt);
  if (normalizedPostedAt === null) {
    return { error: "投稿日時のデータが不正です" };
  }

  const input = {
    conversationId,
    title: titleValue || null,
    content,
    speakerParticipantId,
    postedAt: normalizedPostedAt,
  };

  const validationError = validateAddTextRecordInput(input);
  if (validationError) {
    return { error: validationError };
  }

  try {
    await addTextRecord(supabase, input);
  } catch (error) {
    console.error("Failed to add text record:", error);
    return { error: "テキストレコードの追加に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_THUMBNAIL_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getImageFile(formData: FormData): File | { error: string } {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "画像ファイルを選択してください" };
  }

  if (file.size > MAX_THUMBNAIL_FILE_SIZE) {
    return { error: "ファイルサイズは10MB以内にしてください" };
  }

  if (!file.type.startsWith("image/")) {
    return { error: "画像ファイルを選択してください" };
  }

  return file;
}

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

  const speakerParticipantId = getRequiredStringField(
    formData,
    "speakerParticipantId",
  );
  if (speakerParticipantId === null) {
    return { error: "発言者のデータが不正です" };
  }

  const postedAt = getRequiredStringField(formData, "postedAt");
  if (postedAt === null) {
    return { error: "投稿日時のデータが不正です" };
  }
  const normalizedPostedAt = normalizePostedAtInput(postedAt);
  if (normalizedPostedAt === null) {
    return { error: "投稿日時のデータが不正です" };
  }

  const input = {
    userId: user.id,
    conversationId,
    title: titleValue || null,
    content: contentValue || null,
    file,
    filename: file.name,
    contentType: file.type,
    speakerParticipantId,
    postedAt: normalizedPostedAt,
  };

  const validationError = validateAddMediaRecordInput(input);
  if (validationError) {
    return { error: validationError };
  }

  try {
    await addImageRecord(supabase, input);
  } catch (error) {
    console.error("Failed to add image record:", error);
    return { error: "画像レコードの追加に失敗しました。時間をおいて再度お試しください。" };
  }

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

  const speakerParticipantId = getRequiredStringField(
    formData,
    "speakerParticipantId",
  );
  if (speakerParticipantId === null) {
    return { error: "発言者のデータが不正です" };
  }

  const postedAt = getRequiredStringField(formData, "postedAt");
  if (postedAt === null) {
    return { error: "投稿日時のデータが不正です" };
  }
  const normalizedPostedAt = normalizePostedAtInput(postedAt);
  if (normalizedPostedAt === null) {
    return { error: "投稿日時のデータが不正です" };
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
    speakerParticipantId,
    postedAt: normalizedPostedAt,
  };

  const validationError = validateAddMediaRecordInput(input);
  if (validationError) {
    return { error: validationError };
  }

  try {
    await addVideoRecord(supabase, input);
  } catch (error) {
    console.error("Failed to add video record:", error);
    return { error: "動画レコードの追加に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function addAudioRecordAction(
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
    return { error: "音声ファイルを選択してください" };
  }

  if (file.size > MAX_AUDIO_FILE_SIZE) {
    return { error: "ファイルサイズは50MB以内にしてください" };
  }

  if (!file.type.startsWith("audio/")) {
    return { error: "音声ファイルを選択してください" };
  }

  const titleValue = getOptionalStringField(formData, "title");
  if (titleValue === null) {
    return { error: "タイトルのデータが不正です" };
  }

  const speakerParticipantId = getRequiredStringField(
    formData,
    "speakerParticipantId",
  );
  if (speakerParticipantId === null) {
    return { error: "発言者のデータが不正です" };
  }

  const postedAt = getRequiredStringField(formData, "postedAt");
  if (postedAt === null) {
    return { error: "投稿日時のデータが不正です" };
  }
  const normalizedPostedAt = normalizePostedAtInput(postedAt);
  if (normalizedPostedAt === null) {
    return { error: "投稿日時のデータが不正です" };
  }

  const input = {
    userId: user.id,
    conversationId,
    title: titleValue || null,
    content: null,
    file,
    filename: file.name,
    contentType: file.type,
    speakerParticipantId,
    postedAt: normalizedPostedAt,
  };

  const validationError = validateAddMediaRecordInput(input);
  if (validationError) {
    return { error: validationError };
  }

  try {
    await addAudioRecord(supabase, input);
  } catch (error) {
    console.error("Failed to add audio record:", error);
    return { error: "音声レコードの追加に失敗しました。時間をおいて再度お試しください。" };
  }

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

  try {
    await updateExistingConversation(supabase, conversationId, input);
  } catch (error) {
    console.error("Failed to update conversation:", error);
    return { error: "会話の更新に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

export async function updateParticipantThumbnailAction(
  conversationId: string,
  participantId: string,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const file = getImageFile(formData);
  if (!(file instanceof File)) {
    return file;
  }

  const input = {
    userId: user.id,
    conversationId,
    participantId,
    file,
    filename: file.name,
    contentType: file.type,
    useAsConversationCover: formData.get("useAsConversationCover") === "true",
  };

  const validationError = validateUpdateParticipantThumbnailInput(input);
  if (validationError) {
    return { error: validationError };
  }

  try {
    await updateParticipantThumbnailImage(supabase, input);
  } catch (error) {
    console.error("Failed to update participant thumbnail:", error);
    return { error: "参加者サムネイルの更新に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath("/");
  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

export async function updateConversationCoverImageAction(
  conversationId: string,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const file = getImageFile(formData);
  if (!(file instanceof File)) {
    return file;
  }

  const input = {
    userId: user.id,
    conversationId,
    file,
    filename: file.name,
    contentType: file.type,
  };

  const validationError = validateUpdateConversationCoverImageInput(input);
  if (validationError) {
    return { error: validationError };
  }

  try {
    await updateConversationCoverImage(supabase, input);
  } catch (error) {
    console.error("Failed to update conversation cover image:", error);
    return { error: "会話一覧サムネイルの更新に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath("/");
  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

export async function deleteConversationAction(
  conversationId: string,
): Promise<{ error: string } | void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  try {
    await deleteExistingConversation(supabase, conversationId);
  } catch (error) {
    console.error("Failed to delete conversation:", error);
    return { error: "会話の削除に失敗しました。時間をおいて再度お試しください。" };
  }

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

  try {
    await updateExistingRecord(supabase, recordId, input);
  } catch (error) {
    console.error("Failed to update record:", error);
    return { error: "レコードの更新に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath(`/conversations/${conversationId}`);

  return undefined;
}

export async function deleteRecordAction(
  conversationId: string,
  recordId: string,
): Promise<{ error: string } | void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  try {
    await deleteExistingRecord(supabase, recordId);
  } catch (error) {
    console.error("Failed to delete record:", error);
    return { error: "レコードの削除に失敗しました。時間をおいて再度お試しください。" };
  }

  revalidatePath(`/conversations/${conversationId}`);
}
