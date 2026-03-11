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

  const title = (formData.get("title") as string) || null;
  const content = formData.get("content") as string;

  const input = {
    conversationId,
    title,
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
