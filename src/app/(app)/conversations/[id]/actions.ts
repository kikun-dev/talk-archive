"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addTextRecord,
  validateAddTextRecordInput,
} from "@/usecases/recordUseCases";

export type AddTextRecordState =
  | {
      error?: string;
    }
  | undefined;

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
