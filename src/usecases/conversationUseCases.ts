import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  Conversation,
  ConversationActivePeriod,
  ConversationParticipant,
  IdolGroup,
  Record,
} from "@/types/domain";
import {
  createConversationWithMetadata,
  deleteConversation,
  getConversation,
  getConversations,
  updateConversation,
  updateConversationWithMetadata,
} from "@/repositories/conversationRepository";
import { getConversationActivePeriods } from "@/repositories/conversationActivePeriodRepository";
import { getConversationParticipants } from "@/repositories/conversationParticipantRepository";
import { getRecordsByConversation } from "@/repositories/recordRepository";

export type ConversationWithMetadata = Conversation & {
  activePeriods: ConversationActivePeriod[];
  participants: ConversationParticipant[];
  activeDays: number;
};

export type ConversationWithRecords = ConversationWithMetadata & {
  records: Record[];
};

export type ConversationActivePeriodInput = {
  startDate: string;
  endDate?: string | null;
};

export type ConversationParticipantInput = {
  name: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );

  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function toDayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_IN_MS);
}

function getTodayDateString(today: Date): string {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validateIdolGroup(value: string | undefined): boolean {
  return (
    value === "nogizaka" ||
    value === "sakurazaka" ||
    value === "hinatazaka"
  );
}

export function validateConversationActivePeriods(
  periods: ConversationActivePeriodInput[],
  today: Date = new Date(),
): string | null {
  if (periods.length === 0) {
    return "会話期間を1件以上入力してください";
  }

  const todayDayNumber = toDayNumber(getTodayDateString(today));

  for (const period of periods) {
    if (!isValidDateString(period.startDate)) {
      return "会話期間の日付が不正です";
    }

    if (period.endDate !== undefined && period.endDate !== null) {
      if (!isValidDateString(period.endDate)) {
        return "会話期間の日付が不正です";
      }
      if (toDayNumber(period.endDate) < toDayNumber(period.startDate)) {
        return "会話期間の終了日は開始日以降にしてください";
      }
    } else if (toDayNumber(period.startDate) > todayDayNumber) {
      return "継続中の会話期間の開始日は今日以前にしてください";
    }
  }

  return null;
}

export function validateConversationParticipants(
  participants: ConversationParticipantInput[],
): string | null {
  if (participants.length === 0) {
    return "参加者を1人以上入力してください";
  }

  const normalizedNames = new Set<string>();

  for (const participant of participants) {
    const trimmedName = participant.name.trim();

    if (trimmedName.length === 0) {
      return "参加者名を入力してください";
    }
    if (trimmedName.length > 100) {
      return "参加者名は100文字以内で入力してください";
    }
    if (normalizedNames.has(trimmedName)) {
      return "参加者名が重複しています";
    }

    normalizedNames.add(trimmedName);
  }

  return null;
}

export function calculateConversationActiveDays(
  periods: ConversationActivePeriodInput[] | ConversationActivePeriod[],
  today: Date = new Date(),
): number {
  if (periods.length === 0) {
    return 0;
  }

  const todayDayNumber = toDayNumber(getTodayDateString(today));
  const normalizedRanges = periods
    .map((period) => ({
      start: toDayNumber(period.startDate),
      end:
        period.endDate !== undefined && period.endDate !== null
          ? toDayNumber(period.endDate)
          : todayDayNumber,
    }))
    .filter((range) => range.end >= range.start)
    .sort((left, right) => left.start - right.start);

  if (normalizedRanges.length === 0) {
    return 0;
  }

  let activeDays = 0;
  let currentStart = normalizedRanges[0].start;
  let currentEnd = normalizedRanges[0].end;

  for (const range of normalizedRanges.slice(1)) {
    if (range.start <= currentEnd + 1) {
      currentEnd = Math.max(currentEnd, range.end);
      continue;
    }

    activeDays += currentEnd - currentStart + 1;
    currentStart = range.start;
    currentEnd = range.end;
  }

  return activeDays + (currentEnd - currentStart + 1);
}

export async function listConversations(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Conversation[]> {
  return getConversations(client, userId);
}

export async function listConversationsWithMetadata(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ConversationWithMetadata[]> {
  const conversations = await getConversations(client, userId);

  return Promise.all(
    conversations.map(async (conversation) => {
      const activePeriods = await getConversationActivePeriods(
        client,
        conversation.id,
      );
      const participants = await getConversationParticipants(
        client,
        conversation.id,
      );

      return {
        ...conversation,
        activePeriods,
        participants,
        activeDays: calculateConversationActiveDays(activePeriods),
      };
    }),
  );
}

export async function getConversationWithRecords(
  client: SupabaseClient<Database>,
  id: string,
): Promise<ConversationWithRecords | null> {
  const conversation = await getConversation(client, id);
  if (!conversation) {
    return null;
  }

  const activePeriods = await getConversationActivePeriods(client, id);
  const participants = await getConversationParticipants(client, id);
  const records = await getRecordsByConversation(client, id);

  return {
    ...conversation,
    activePeriods,
    participants,
    activeDays: calculateConversationActiveDays(activePeriods),
    records,
  };
}

export type CreateConversationInput = {
  userId: string;
  title: string;
  idolGroup: IdolGroup;
  sourceId?: string | null;
  coverImagePath?: string | null;
  activePeriods: ConversationActivePeriodInput[];
  participants: ConversationParticipantInput[];
};

export function validateCreateConversationInput(
  input: CreateConversationInput,
): string | null {
  const trimmed = input.title.trim();
  if (trimmed.length === 0) {
    return "タイトルを入力してください";
  }
  if (trimmed.length > 200) {
    return "タイトルは200文字以内で入力してください";
  }
  if (!validateIdolGroup(input.idolGroup)) {
    return "グループを選択してください";
  }

  const activePeriodError = validateConversationActivePeriods(input.activePeriods);
  if (activePeriodError) {
    return activePeriodError;
  }

  return validateConversationParticipants(input.participants);
}

export async function createNewConversation(
  client: SupabaseClient<Database>,
  input: CreateConversationInput,
): Promise<ConversationWithMetadata> {
  const validationError = validateCreateConversationInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const conversation = await createConversationWithMetadata(client, {
    userId: input.userId,
    title: input.title.trim(),
    idolGroup: input.idolGroup,
    sourceId: input.sourceId,
    coverImagePath: input.coverImagePath,
    activePeriods: input.activePeriods,
    participants: input.participants.map((participant) => ({
      name: participant.name.trim(),
    })),
  });
  const activePeriods = await getConversationActivePeriods(client, conversation.id);
  const participants = await getConversationParticipants(client, conversation.id);

  return {
    ...conversation,
    activePeriods,
    participants,
    activeDays: calculateConversationActiveDays(activePeriods),
  };
}

export type UpdateConversationInput = {
  title?: string;
  idolGroup?: IdolGroup;
  sourceId?: string | null;
  coverImagePath?: string | null;
  activePeriods?: ConversationActivePeriodInput[];
  participants?: ConversationParticipantInput[];
};

export function validateUpdateConversationInput(
  input: UpdateConversationInput,
): string | null {
  if (
    input.title === undefined &&
    input.idolGroup === undefined &&
    input.sourceId === undefined &&
    input.coverImagePath === undefined &&
    input.activePeriods === undefined &&
    input.participants === undefined
  ) {
    return "更新項目を指定してください";
  }

  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (trimmed.length === 0) {
      return "タイトルを入力してください";
    }
    if (trimmed.length > 200) {
      return "タイトルは200文字以内で入力してください";
    }
  }

  if (input.idolGroup !== undefined && !validateIdolGroup(input.idolGroup)) {
    return "グループを選択してください";
  }

  if (input.activePeriods !== undefined) {
    const activePeriodError = validateConversationActivePeriods(input.activePeriods);
    if (activePeriodError) {
      return activePeriodError;
    }
  }

  if (input.participants !== undefined) {
    return validateConversationParticipants(input.participants);
  }

  return null;
}

export async function updateExistingConversation(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateConversationInput,
): Promise<ConversationWithMetadata> {
  const validationError = validateUpdateConversationInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const conversation =
    input.activePeriods !== undefined || input.participants !== undefined
      ? await updateConversationWithMetadata(client, id, {
          title: input.title?.trim(),
          idolGroup: input.idolGroup,
          sourceId: input.sourceId,
          coverImagePath: input.coverImagePath,
          activePeriods: input.activePeriods,
          participants: input.participants?.map((participant) => ({
            name: participant.name.trim(),
          })),
        })
      : await updateConversation(client, id, {
          title: input.title?.trim(),
          idolGroup: input.idolGroup,
          sourceId: input.sourceId,
          coverImagePath: input.coverImagePath,
        });
  const activePeriods = await getConversationActivePeriods(client, id);
  const participants = await getConversationParticipants(client, id);

  return {
    ...conversation,
    activePeriods,
    participants,
    activeDays: calculateConversationActiveDays(activePeriods),
  };
}

export async function deleteExistingConversation(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteConversation(client, id);
}
