"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addTextRecordAction,
  addImageRecordAction,
  addVideoRecordAction,
  addAudioRecordAction,
  type ActionState,
} from "@/app/(app)/conversations/[id]/actions";
import { FormError } from "@/components/FormError";
import type { ConversationParticipant, RecordType } from "@/types/domain";

type ChatComposerProps = {
  conversationId: string;
  participants: ConversationParticipant[];
};

type ComposerTab = RecordType;

const tabs: { type: ComposerTab; label: string }[] = [
  { type: "text", label: "テキスト" },
  { type: "image", label: "画像" },
  { type: "video", label: "動画" },
  { type: "audio", label: "音声" },
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_MEDIA_SIZE = 50 * 1024 * 1024;

export function ChatComposer({
  conversationId,
  participants,
}: ChatComposerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [activeTab, setActiveTab] = useState<ComposerTab>("text");
  const [speakerParticipantId, setSpeakerParticipantId] = useState(
    participants.length === 1 ? participants[0].id : "",
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const actionMap = {
    text: addTextRecordAction,
    image: addImageRecordAction,
    video: addVideoRecordAction,
    audio: addAudioRecordAction,
  };

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (_prevState, formData) => {
      setClientError(null);
      const action = actionMap[activeTab];
      const result = await action(conversationId, _prevState, formData);
      if (!result?.error) {
        formRef.current?.reset();
        setPreviewUrl(null);
        if (participants.length === 1) {
          setSpeakerParticipantId(participants[0].id);
        }
      }
      return result;
    },
    undefined,
  );

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

    const maxSize = activeTab === "image" ? MAX_IMAGE_SIZE : MAX_MEDIA_SIZE;
    const maxLabel = activeTab === "image" ? "10MB" : "50MB";

    if (file.size > maxSize) {
      setClientError(`ファイルサイズは${maxLabel}以内にしてください`);
      setPreviewUrl(null);
      e.target.value = "";
      return;
    }

    const expectedPrefix =
      activeTab === "image"
        ? "image/"
        : activeTab === "video"
          ? "video/"
          : "audio/";
    if (!file.type.startsWith(expectedPrefix)) {
      const typeLabel =
        activeTab === "image"
          ? "画像"
          : activeTab === "video"
            ? "動画"
            : "音声";
      setClientError(`${typeLabel}ファイルを選択してください`);
      setPreviewUrl(null);
      e.target.value = "";
      return;
    }

    if (activeTab === "image") {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  function handleTabChange(tab: ComposerTab) {
    setActiveTab(tab);
    setClientError(null);
    setPreviewUrl(null);
    formRef.current?.reset();
  }

  const displayError = clientError ?? state?.error;
  const isSingleParticipant = participants.length === 1;

  return (
    <div className="border-t border-gray-300 bg-white">
      <div
        data-testid="composer-tabs"
        className="overflow-x-auto border-b border-gray-200"
      >
        <div className="flex min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.type}
              type="button"
              onClick={() => handleTabChange(tab.type)}
              className={`min-w-16 flex-1 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.type
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <form ref={formRef} action={formAction} className="space-y-2 p-3">
        <div
          data-testid="composer-primary-fields"
          className="flex flex-col gap-2 sm:flex-row"
        >
          {!isSingleParticipant && (
            <div className="flex-1">
              <select
                name="speakerParticipantId"
                required
                value={speakerParticipantId}
                onChange={(e) => setSpeakerParticipantId(e.target.value)}
                className="block w-full rounded border border-gray-300 px-2 py-2 text-sm"
              >
                <option value="">発言者を選択</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isSingleParticipant && (
            <input
              type="hidden"
              name="speakerParticipantId"
              value={participants[0].id}
            />
          )}
          <div className="flex-1">
            <input
              name="postedAt"
              type="datetime-local"
              required
              className="block w-full rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
        </div>

        {(activeTab === "text" || activeTab === "image") && (
          <input
            name="title"
            type="text"
            maxLength={200}
            placeholder="タイトル（任意）"
            className="block w-full rounded border border-gray-300 px-2 py-2 text-sm"
          />
        )}

        {activeTab === "text" && (
          <textarea
            name="content"
            required
            rows={2}
            placeholder="メッセージを入力"
            className="block w-full rounded border border-gray-300 px-2 py-2 text-sm"
          />
        )}

        {activeTab === "image" && (
          <>
            <textarea
              name="content"
              rows={1}
              placeholder="テキスト（任意）"
              className="block w-full rounded border border-gray-300 px-2 py-2 text-sm"
            />
            <input
              name="file"
              type="file"
              accept="image/*"
              required
              onChange={handleFileChange}
              className="block w-full text-sm"
            />
            {previewUrl && (
              <Image
                src={previewUrl}
                alt="プレビュー"
                unoptimized
                width={160}
                height={96}
                className="max-h-40 w-full rounded border border-gray-200 object-contain"
              />
            )}
          </>
        )}

        {activeTab === "video" && (
          <>
            <input
              name="file"
              type="file"
              accept="video/*"
              required
              onChange={handleFileChange}
              className="block w-full text-sm"
            />
            <label className="flex items-center gap-1.5 text-xs">
              <input
                name="hasAudio"
                type="checkbox"
                value="true"
                defaultChecked
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              音声あり
            </label>
          </>
        )}

        {activeTab === "audio" && (
          <input
            name="file"
            type="file"
            accept="audio/*"
            required
            onChange={handleFileChange}
            className="block w-full text-sm"
          />
        )}

        <FormError message={displayError} />

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "追加中..." : "追加"}
        </button>
      </form>
    </div>
  );
}
