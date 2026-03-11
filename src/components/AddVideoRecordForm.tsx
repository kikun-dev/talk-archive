"use client";

import { useActionState, useRef, useState } from "react";
import {
  addVideoRecordAction,
  type ActionState,
} from "@/app/(app)/conversations/[id]/actions";

type AddVideoRecordFormProps = {
  conversationId: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function AddVideoRecordForm({
  conversationId,
}: AddVideoRecordFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState<
    ActionState,
    FormData
  >(async (_prevState, formData) => {
    setClientError(null);
    const result = await addVideoRecordAction(
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

    if (!file.type.startsWith("video/")) {
      setClientError("動画ファイルを選択してください");
      e.target.value = "";
      return;
    }
  }

  const displayError = clientError ?? state?.error;

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="video-record-title"
          className="block text-sm font-medium"
        >
          タイトル（任意）
        </label>
        <input
          id="video-record-title"
          name="title"
          type="text"
          maxLength={200}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="video-record-file"
          className="block text-sm font-medium"
        >
          動画ファイル
        </label>
        <input
          id="video-record-file"
          name="file"
          type="file"
          accept="video/*"
          required
          onChange={handleFileChange}
          className="mt-1 block w-full text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="video-record-has-audio"
          name="hasAudio"
          type="checkbox"
          value="true"
          defaultChecked
          className="h-4 w-4 rounded border-gray-300"
        />
        <label
          htmlFor="video-record-has-audio"
          className="text-sm font-medium"
        >
          音声あり
        </label>
      </div>

      {displayError && (
        <p className="text-sm text-red-600">{displayError}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "アップロード中..." : "動画を追加"}
      </button>
    </form>
  );
}
