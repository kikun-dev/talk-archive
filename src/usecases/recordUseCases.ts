import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Record } from "@/types/domain";
import {
  createTextRecordAtNextPosition,
  updateRecord,
  deleteRecord,
} from "@/repositories/recordRepository";

export type AddTextRecordInput = {
  conversationId: string;
  title?: string | null;
  content: string;
};

export function validateAddTextRecordInput(
  input: AddTextRecordInput,
): string | null {
  const trimmedContent = input.content.trim();
  if (trimmedContent.length === 0) {
    return "テキストを入力してください";
  }

  if (input.title !== undefined && input.title !== null) {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length > 200) {
      return "タイトルは200文字以内で入力してください";
    }
  }

  return null;
}

export async function addTextRecord(
  client: SupabaseClient<Database>,
  input: AddTextRecordInput,
): Promise<Record> {
  const validationError = validateAddTextRecordInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return createTextRecordAtNextPosition(client, {
    conversationId: input.conversationId,
    title: input.title?.trim() ?? null,
    content: input.content.trim(),
  });
}

export type UpdateRecordInput = {
  title?: string | null;
  content?: string | null;
};

export function validateUpdateRecordInput(
  input: UpdateRecordInput,
): string | null {
  if (input.title === undefined && input.content === undefined) {
    return "更新項目を指定してください";
  }

  if (input.title !== undefined && input.title !== null) {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length > 200) {
      return "タイトルは200文字以内で入力してください";
    }
  }

  if (input.content !== undefined && input.content !== null) {
    const trimmedContent = input.content.trim();
    if (trimmedContent.length === 0) {
      return "テキストを入力してください";
    }
  }
  if (input.content === null) {
    return "テキストを入力してください";
  }

  return null;
}

export async function updateExistingRecord(
  client: SupabaseClient<Database>,
  id: string,
  input: UpdateRecordInput,
): Promise<Record> {
  const validationError = validateUpdateRecordInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  return updateRecord(client, id, {
    title: input.title !== undefined ? (input.title?.trim() ?? null) : undefined,
    content:
      input.content !== undefined
        ? (input.content?.trim() ?? null)
        : undefined,
  });
}

export async function deleteExistingRecord(
  client: SupabaseClient<Database>,
  id: string,
): Promise<void> {
  return deleteRecord(client, id);
}
