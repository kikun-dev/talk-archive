"use client";

import Image from "next/image";
import { useActionState, useState, useTransition } from "react";
import {
  updateRecordAction,
  deleteRecordAction,
  type ActionState,
} from "@/app/(app)/conversations/[id]/actions";
import { formatTimeJst } from "@/lib/dateTime";
import { FormError } from "@/components/FormError";
import { useToast } from "@/components/ToastProvider";
import type { Record } from "@/types/domain";
import type { MediaUrl } from "@/usecases/recordUseCases";

type ChatMessageProps = {
  record: Record;
  participantName: string;
  conversationId: string;
  mediaUrl?: MediaUrl;
};

function getInitial(name: string): string {
  return name.charAt(0);
}

function MediaContent({
  record,
  mediaUrl,
}: {
  record: Record;
  mediaUrl: MediaUrl;
}) {
  switch (record.recordType) {
    case "image":
      return (
        <Image
          src={mediaUrl.url}
          alt={record.title ?? "画像"}
          unoptimized
          width={240}
          height={160}
          className="mt-1 max-h-60 w-auto rounded object-contain"
        />
      );
    case "video":
      return (
        <video controls className="mt-1 max-h-60 w-full rounded">
          <source src={mediaUrl.url} type={mediaUrl.mimeType} />
        </video>
      );
    case "audio":
      return (
        <audio controls className="mt-1 w-full">
          <source src={mediaUrl.url} type={mediaUrl.mimeType} />
        </audio>
      );
    default:
      return null;
  }
}

export function ChatMessage({
  record,
  participantName,
  conversationId,
  mediaUrl,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const { addToast } = useToast();

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
    setIsActionMenuOpen(false);
    if (!window.confirm("このレコードを削除しますか？")) return;
    startDeleteTransition(async () => {
      const result = await deleteRecordAction(conversationId, record.id);
      if (result?.error) {
        addToast(result.error, "error");
      }
    });
  }

  const initial = getInitial(participantName);

  if (isEditing) {
    return (
      <div className="flex gap-2 px-4" data-record-id={record.id}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-400 text-sm font-bold text-white">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-600">{participantName}</p>
          <div className="mt-1 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <form action={formAction} className="space-y-2">
              <div>
                <label
                  htmlFor={`edit-title-${record.id}`}
                  className="block text-xs font-medium"
                >
                  タイトル（任意）
                </label>
                <input
                  id={`edit-title-${record.id}`}
                  name="title"
                  type="text"
                  maxLength={200}
                  defaultValue={record.title ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-content-${record.id}`}
                  className="block text-xs font-medium"
                >
                  テキスト
                </label>
                <textarea
                  id={`edit-content-${record.id}`}
                  name="content"
                  required
                  rows={3}
                  defaultValue={record.content ?? ""}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
              <FormError message={state?.error} />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {isPending ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-2 px-4" data-record-id={record.id}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-400 text-sm font-bold text-white">
        {initial}
      </div>
      <div className="min-w-0 max-w-[85%] sm:max-w-[75%]">
        <p className="text-xs font-medium text-gray-600">{participantName}</p>
        <div className="mt-0.5 rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm">
          {record.title && (
            <p className="text-xs font-semibold text-gray-800">
              {record.title}
            </p>
          )}
          {record.content && (
            <p className="whitespace-pre-wrap text-sm text-gray-700">
              {record.content}
            </p>
          )}
          {mediaUrl && <MediaContent record={record} mediaUrl={mediaUrl} />}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[10px] text-gray-400">
            {formatTimeJst(record.postedAt)}
          </span>
          <div className="hidden gap-1 sm:group-hover:flex sm:group-focus-within:flex">
            {record.recordType === "text" && (
              <button
                type="button"
                onClick={() => {
                  setIsActionMenuOpen(false);
                  setIsEditing(true);
                }}
                className="text-[10px] text-blue-500 hover:text-blue-700"
              >
                編集
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-[10px] text-red-400 hover:text-red-600 disabled:opacity-50"
            >
              {isDeleting ? "..." : "削除"}
            </button>
          </div>
          <button
            type="button"
            aria-label="操作"
            aria-expanded={isActionMenuOpen}
            onClick={() => setIsActionMenuOpen((prev) => !prev)}
            className="ml-auto rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
            </svg>
          </button>
        </div>
        {isActionMenuOpen && (
          <div
            role="menu"
            aria-label="レコード操作"
            className="mt-2 flex gap-2"
          >
            {record.recordType === "text" && (
              <button
                type="button"
                onClick={() => {
                  setIsActionMenuOpen(false);
                  setIsEditing(true);
                }}
                className="rounded border border-blue-200 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50"
              >
                編集
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {isDeleting ? "削除中..." : "削除"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
