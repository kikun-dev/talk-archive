import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  Conversation,
  ConversationActivePeriod,
  IdolGroup,
  Record,
} from "@/types/domain";
import {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} from "@/repositories/conversationRepository";
import {
  createConversationActivePeriods,
  getConversationActivePeriods,
  replaceConversationActivePeriods,
} from "@/repositories/conversationActivePeriodRepository";
import { getRecordsByConversation } from "@/repositories/recordRepository";

export type ConversationWithMetadata = Conversation & {
  activePeriods: ConversationActivePeriod[];
  activeDays: number;
};

export type ConversationWithRecords = ConversationWithMetadata & {
  records: Record[];
};

export type ConversationActivePeriodInput = {
  startDate: string;
  endDate?: string | null;
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
): string | null {
  if (periods.length === 0) {
    return "会話期間を1件以上入力してください";
  }

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
    }
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
    .sort((left, right) => left.start - right.start);

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

export async function getConversationWithRecords(
  client: SupabaseClient<Database>,
  id: string,
): Promise<ConversationWithRecords | null> {
  const conversation = await getConversation(client, id);
  if (!conversation) {
    return null;
  }

  const activePeriods = await getConversationActivePeriods(client, id);
  const records = await getRecordsByConversation(client, id);

  return {
    ...conversation,
    activePeriods,
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

  return validateConversationActivePeriods(input.activePeriods);
}

function toActivePeriodInsertParams(
  conversationId: string,
  periods: ConversationActivePeriodInput[],
) {
  return periods.map((period) => ({
    conversationId,
    startDate: period.startDate,
    endDate: period.endDate ?? null,
  }));
}

export async function createNewConversation(
  client: SupabaseClient<Database>,
  input: CreateConversationInput,
): Promise<ConversationWithMetadata> {
  const validationError = validateCreateConversationInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const conversation = await createConversation(client, {
    userId: input.userId,
    title: input.title.trim(),
    idolGroup: input.idolGroup,
    sourceId: input.sourceId,
    coverImagePath: input.coverImagePath,
  });
  const activePeriods = await createConversationActivePeriods(
    client,
    toActivePeriodInsertParams(conversation.id, input.activePeriods),
  );

  return {
    ...conversation,
    activePeriods,
    activeDays: calculateConversationActiveDays(activePeriods),
  };
}

export type UpdateConversationInput = {
  title?: string;
  idolGroup?: IdolGroup;
  sourceId?: string | null;
  coverImagePath?: string | null;
  activePeriods?: ConversationActivePeriodInput[];
};

export function validateUpdateConversationInput(
  input: UpdateConversationInput,
): string | null {
  if (
    input.title === undefined &&
    input.idolGroup === undefined &&
    input.sourceId === undefined &&
    input.coverImagePath === undefined &&
    input.activePeriods === undefined
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
    return validateConversationActivePeriods(input.activePeriods);
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

  const conversation = await updateConversation(client, id, {
    title: input.title?.trim(),
    idolGroup: input.idolGroup,
    sourceId: input.sourceId,
    coverImagePath: input.coverImagePath,
  });
  const activePeriods =
    input.activePeriods !== undefined
      ? await replaceConversationActivePeriods(client, id, input.activePeriods)
      : await getConversationActivePeriods(client, id);

  return {
    ...conversation,
    activePeriods,
    activeDays: calculateConversationActiveDays(activePeriods),
  };
}

export async function deleteExistingConversation(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteConversation(client, id);
}
