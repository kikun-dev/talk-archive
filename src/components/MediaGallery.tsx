"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatDateTimeJst } from "@/lib/dateTime";
import type { ConversationParticipant, Record, RecordType } from "@/types/domain";
import type { MediaUrl } from "@/usecases/recordUseCases";

type MediaGalleryProps = {
  conversationId: string;
  records: Record[];
  participants: ConversationParticipant[];
  mediaUrls: { [recordId: string]: MediaUrl };
};

type MediaTab = "all" | "image" | "video" | "audio";

const tabs: { key: MediaTab; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "image", label: "画像" },
  { key: "video", label: "動画" },
  { key: "audio", label: "音声" },
];

const recordTypeLabels: { [K in RecordType]: string } = {
  text: "テキスト",
  image: "画像",
  video: "動画",
  audio: "音声",
};

export function MediaGallery({
  conversationId,
  records,
  participants,
  mediaUrls,
}: MediaGalleryProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>("all");
  const participantMap = new Map(participants.map((p) => [p.id, p.name]));

  const filteredRecords =
    activeTab === "all"
      ? records
      : records.filter((r) => r.recordType === activeTab);

  return (
    <div>
      {/* Tabs */}
      <div className="overflow-x-auto border-b border-gray-200">
        <div role="tablist" className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {filteredRecords.length === 0 ? (
        <p className="mt-6 text-center text-sm text-gray-500">
          {activeTab === "all"
            ? "メディアレコードがありません。"
            : `${tabs.find((t) => t.key === activeTab)?.label}レコードがありません。`}
        </p>
      ) : (
        <div
          data-testid="media-gallery-grid"
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {filteredRecords.map((record) => {
            const media = mediaUrls[record.id];
            const speakerName =
              participantMap.get(record.speakerParticipantId) ?? "不明";

            return (
              <Link
                key={record.id}
                href={`/conversations/${conversationId}?recordId=${record.id}`}
                className="block rounded-lg border border-gray-200 p-3.5 transition-colors hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    {recordTypeLabels[record.recordType]}
                  </span>
                  <span>{formatDateTimeJst(record.postedAt)}</span>
                  <span>{speakerName}</span>
                </div>

                {record.title && (
                  <p className="mt-1 text-sm font-medium text-gray-700">
                    {record.title}
                  </p>
                )}

                {media && (
                  <MediaPreview record={record} mediaUrl={media} />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MediaPreview({
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
          width={480}
          height={360}
          className="mt-2 aspect-[4/3] w-full rounded bg-gray-100 object-contain"
        />
      );
    case "video":
      return (
        <video
          aria-label={record.title ?? "動画"}
          className="mt-2 aspect-[4/3] w-full rounded bg-black object-contain"
          preload="metadata"
        >
          <source src={mediaUrl.url} type={mediaUrl.mimeType} />
        </video>
      );
    case "audio":
      return (
        <audio controls aria-label={record.title ?? "音声"} className="mt-2 w-full" preload="metadata">
          <source src={mediaUrl.url} type={mediaUrl.mimeType} />
        </audio>
      );
    default:
      return null;
  }
}
