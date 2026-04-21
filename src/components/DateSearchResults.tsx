"use client";

import Link from "next/link";
import { formatTimeJst } from "@/lib/dateTime";
import type { ConversationParticipant, Record, RecordType } from "@/types/domain";
import { replaceMyNamePlaceholder } from "@/usecases/contentTransform";

type DateSearchResultsProps = {
  conversationId: string;
  records: Record[];
  participants: ConversationParticipant[];
  selectedDate: string;
  onRecordSelect?: () => void;
  displayName: string;
};

const recordTypeLabels: { [K in RecordType]: string } = {
  text: "テキスト",
  image: "画像",
  video: "動画",
  audio: "音声",
};

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}

export function DateSearchResults({
  conversationId,
  records,
  participants,
  selectedDate,
  onRecordSelect,
  displayName,
}: DateSearchResultsProps) {
  const participantMap = new Map(participants.map((p) => [p.id, p.name]));

  if (records.length === 0) {
    return (
      <p className="mt-4 text-sm text-gray-500">
        {selectedDate} のレコードはありません。
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-gray-600">
        {records.length}件のレコード
      </p>
      <ul className="space-y-2">
        {records.map((record) => (
          <li key={record.id}>
            <Link
              href={`/conversations/${conversationId}?recordId=${record.id}`}
              onClick={onRecordSelect}
              className="block rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  {recordTypeLabels[record.recordType]}
                </span>
                <span className="text-xs text-gray-500">
                  {formatTimeJst(record.postedAt)}
                </span>
                <span className="text-xs text-gray-500">
                  {participantMap.get(record.speakerParticipantId) ?? "不明"}
                </span>
              </div>
              {record.content && (
                <p className="mt-1 text-sm text-gray-700">
                  {truncate(replaceMyNamePlaceholder(record.content, displayName), 100)}
                </p>
              )}
              {record.title && !record.content && (
                <p className="mt-1 text-sm font-medium text-gray-700">
                  {truncate(replaceMyNamePlaceholder(record.title, displayName), 100)}
                </p>
              )}
              {!record.content && !record.title && (
                <p className="mt-1 text-sm text-gray-400">
                  ({recordTypeLabels[record.recordType]}ファイル)
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
