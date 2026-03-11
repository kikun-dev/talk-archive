"use client";

import { useActionState, useRef } from "react";
import {
  addTextRecordAction,
  type AddTextRecordState,
} from "@/app/(app)/conversations/[id]/actions";

type AddTextRecordFormProps = {
  conversationId: string;
};

export function AddTextRecordForm({
  conversationId,
}: AddTextRecordFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<
    AddTextRecordState,
    FormData
  >(async (_prevState, formData) => {
    const result = await addTextRecordAction(
      conversationId,
      _prevState,
      formData,
    );
    if (!result?.error) {
      formRef.current?.reset();
    }
    return result;
  }, undefined);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="record-title" className="block text-sm font-medium">
          タイトル（任意）
        </label>
        <input
          id="record-title"
          name="title"
          type="text"
          maxLength={200}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="record-content" className="block text-sm font-medium">
          テキスト
        </label>
        <textarea
          id="record-content"
          name="content"
          required
          rows={4}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "追加中..." : "追加"}
      </button>
    </form>
  );
}
