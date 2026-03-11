"use client";

import { useActionState, useRef, useState } from "react";
import {
  addAudioRecordAction,
  type ActionState,
} from "@/app/(app)/conversations/[id]/actions";

type AddAudioRecordFormProps = {
  conversationId: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function AddAudioRecordForm({
  conversationId,
}: AddAudioRecordFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState<
    ActionState,
    FormData
  >(async (_prevState, formData) => {
    setClientError(null);
    const result = await addAudioRecordAction(
      conversationId,
      _prevState,
      formData,
    );
    if (!result?.error) {
      formRef.current?.reset();
    }
    return result;
  }, undefined);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setClientError("ファイルサイズは50MB以内にしてください");
      e.target.value = "";
      return;
    }

    if (!file.type.startsWith("audio/")) {
      setClientError("音声ファイルを選択してください");
      e.target.value = "";
      return;
    }
  }

  const displayError = clientError ?? state?.error;

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="audio-record-title"
          className="block text-sm font-medium"
        >
          タイトル（任意）
        </label>
        <input
          id="audio-record-title"
          name="title"
          type="text"
          maxLength={200}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="audio-record-file"
          className="block text-sm font-medium"
        >
          音声ファイル
        </label>
        <input
          id="audio-record-file"
          name="file"
          type="file"
          accept="audio/*"
          required
          onChange={handleFileChange}
          className="mt-1 block w-full text-sm"
        />
      </div>

      {displayError && (
        <p className="text-sm text-red-600">{displayError}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "アップロード中..." : "音声を追加"}
      </button>
    </form>
  );
}
