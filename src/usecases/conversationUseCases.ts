import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Conversation, Record } from "@/types/domain";
import {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} from "@/repositories/conversationRepository";
import { getRecordsByConversation } from "@/repositories/recordRepository";

export type ConversationWithRecords = Conversation & {
  records: Record[];
};

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

  const records = await getRecordsByConversation(client, id);

  return { ...conversation, records };
}

export type CreateConversationInput = {
  userId: string;
  title: string;
  sourceId?: string | null;
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
  return null;
}

export async function createNewConversation(
  client: SupabaseClient<Database>,
  input: CreateConversationInput,
): Promise<Conversation> {
  const validationError = validateCreateConversationInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return createConversation(client, {
    userId: input.userId,
    title: input.title.trim(),
    sourceId: input.sourceId,
  });
}

export type UpdateConversationInput = {
  title?: string;
  sourceId?: string | null;
};

export function validateUpdateConversationInput(
  input: UpdateConversationInput,
): string | null {
  if (input.title === undefined && input.sourceId === undefined) {
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
  return null;
}

export async function updateExistingConversation(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateConversationInput,
): Promise<Conversation> {
  const validationError = validateUpdateConversationInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return updateConversation(client, id, {
    title: input.title?.trim(),
    sourceId: input.sourceId,
  });
}

export async function deleteExistingConversation(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteConversation(client, id);
}
