"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateRecordAction,
  deleteRecordAction,
  type ActionState,
} from "@/app/(app)/conversations/[id]/actions";
import { RecordCard } from "@/components/RecordCard";
import type { Record } from "@/types/domain";
import type { MediaUrl } from "@/usecases/recordUseCases";

type EditableRecordCardProps = {
  record: Record;
  conversationId: string;
  mediaUrl?: MediaUrl;
};

export function EditableRecordCard({
  record,
  conversationId,
  mediaUrl,
}: EditableRecordCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (_prevState, formData) => {
      const result = await updateRecordAction(
        conversationId,
        record.id,
        _prevState,
        formData,
      );
      if (!result?.error) {
        setIsEditing(false);
      }
      return result;
    },
    undefined,
  );

  function handleDelete() {
    if (!window.confirm("このレコードを削除しますか？")) {
      return;
    }

    startDeleteTransition(async () => {
      await deleteRecordAction(conversationId, record.id);
    });
  }

  if (isEditing) {
    return (
      <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3">
        <form action={formAction} className="space-y-3">
          <div>
            <label
              htmlFor={`edit-record-title-${record.id}`}
              className="block text-sm font-medium"
            >
              タイトル（任意）
            </label>
            <input
              id={`edit-record-title-${record.id}`}
              name="title"
              type="text"
              maxLength={200}
              defaultValue={record.title ?? ""}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor={`edit-record-content-${record.id}`}
              className="block text-sm font-medium"
            >
              テキスト
            </label>
            <textarea
              id={`edit-record-content-${record.id}`}
              name="content"
              required
              rows={4}
              defaultValue={record.content ?? ""}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <RecordCard record={record} mediaUrl={mediaUrl} />
      <div className="mt-1 flex gap-2">
        {record.recordType === "text" && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            編集
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          {isDeleting ? "削除中..." : "削除"}
        </button>
      </div>
    </div>
  );
}
