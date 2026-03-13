"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addImageRecordAction,
  type ActionState,
} from "@/app/(app)/conversations/[id]/actions";
import { FormError } from "@/components/FormError";

type AddImageRecordFormProps = {
  conversationId: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function AddImageRecordForm({
  conversationId,
}: AddImageRecordFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState<
    ActionState,
    FormData
  >(async (_prevState, formData) => {
    setClientError(null);
    const result = await addImageRecordAction(
      conversationId,
      _prevState,
      formData,
    );
    if (!result?.error) {
      formRef.current?.reset();
      setPreviewUrl(null);
    }
    return result;
  }, undefined);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setClientError(null);
    const file = e.target.files?.[0];

    if (!file) {
      setPreviewUrl(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setClientError("ファイルサイズは10MB以内にしてください");
      setPreviewUrl(null);
      e.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      setClientError("画像ファイルを選択してください");
      setPreviewUrl(null);
      e.target.value = "";
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
  }

  const displayError = clientError ?? state?.error;

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="image-record-title"
          className="block text-sm font-medium"
        >
          タイトル（任意）
        </label>
        <input
          id="image-record-title"
          name="title"
          type="text"
          maxLength={200}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="image-record-content"
          className="block text-sm font-medium"
        >
          テキスト（任意）
        </label>
        <textarea
          id="image-record-content"
          name="content"
          rows={2}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="image-record-file"
          className="block text-sm font-medium"
        >
          画像ファイル
        </label>
        <input
          id="image-record-file"
          name="file"
          type="file"
          accept="image/*"
          required
          onChange={handleFileChange}
          className="mt-1 block w-full text-sm"
        />
      </div>

      {previewUrl && (
        <div className="mt-2">
          <Image
            src={previewUrl}
            alt="プレビュー"
            unoptimized
            width={320}
            height={192}
            className="max-h-48 w-auto rounded border border-gray-200 object-contain"
          />
        </div>
      )}

      <FormError message={displayError} />

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "アップロード中..." : "画像を追加"}
      </button>
    </form>
  );
}
