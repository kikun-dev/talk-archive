"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import {
  updateConversationCoverImageAction,
  updateParticipantThumbnailAction,
} from "@/app/(app)/conversations/[id]/actions";
import { FormError } from "@/components/FormError";
import type { ConversationParticipant } from "@/types/domain";

type ConversationThumbnailManagerProps = {
  conversationId: string;
  participants: ConversationParticipant[];
  participantThumbnailUrls: { [participantId: string]: string };
  coverImagePath: string | null;
  coverImageUrl?: string;
};

function getInitial(name: string): string {
  return name.charAt(0);
}

function ThumbnailPreview({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl?: string;
}) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={`${name}のサムネイル`}
        unoptimized
        width={40}
        height={40}
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300 text-sm font-bold text-white">
      {getInitial(name)}
    </div>
  );
}

export function ConversationThumbnailManager({
  conversationId,
  participants,
  participantThumbnailUrls,
  coverImagePath,
  coverImageUrl,
}: ConversationThumbnailManagerProps) {
  const [error, setError] = useState<string | undefined>();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSingleParticipant = participants.length === 1;

  function submitParticipantThumbnail(
    event: FormEvent<HTMLFormElement>,
    participantId: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(undefined);
    setPendingKey(participantId);
    startTransition(async () => {
      const result = await updateParticipantThumbnailAction(
        conversationId,
        participantId,
        formData,
      );
      setPendingKey(null);
      setError(result?.error);
      if (!result?.error) {
        form.reset();
      }
    });
  }

  function submitConversationCover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(undefined);
    setPendingKey("cover");
    startTransition(async () => {
      const result = await updateConversationCoverImageAction(
        conversationId,
        formData,
      );
      setPendingKey(null);
      setError(result?.error);
      if (!result?.error) {
        form.reset();
      }
    });
  }

  return (
    <section className="border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">サムネイル</h2>
        <div className="space-y-2">
          {participants.map((participant) => (
            <form
              key={participant.id}
              onSubmit={(event) =>
                submitParticipantThumbnail(event, participant.id)
              }
              className="flex flex-wrap items-center gap-2"
            >
              <ThumbnailPreview
                name={participant.name}
                imageUrl={participantThumbnailUrls[participant.id]}
              />
              <span className="min-w-24 text-sm text-gray-700">
                {participant.name}
              </span>
              <input
                type="file"
                name="file"
                accept="image/*"
                required
                aria-label={`${participant.name}のサムネイル画像`}
                className="min-w-0 flex-1 text-xs"
              />
              {isSingleParticipant && (
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    name="useAsConversationCover"
                    value="true"
                    defaultChecked
                  />
                  会話一覧にも使用
                </label>
              )}
              <button
                type="submit"
                disabled={isPending && pendingKey === participant.id}
                className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {isPending && pendingKey === participant.id ? "保存中..." : "保存"}
              </button>
            </form>
          ))}
        </div>

        {!isSingleParticipant && (
          <form
            onSubmit={submitConversationCover}
            className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3"
          >
            <ThumbnailPreview
              name="会話一覧"
              imageUrl={coverImageUrl ?? undefined}
            />
            <span className="min-w-24 text-sm text-gray-700">会話一覧</span>
            <input
              type="file"
              name="file"
              accept="image/*"
              required
              aria-label="会話一覧用サムネイル画像"
              className="min-w-0 flex-1 text-xs"
            />
            <button
              type="submit"
              disabled={isPending && pendingKey === "cover"}
              className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending && pendingKey === "cover" ? "保存中..." : "保存"}
            </button>
            {!coverImageUrl && coverImagePath && (
              <span className="text-xs text-gray-500">登録済み</span>
            )}
          </form>
        )}

        <FormError message={error} />
      </div>
    </section>
  );
}
