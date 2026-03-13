"use client";

import Link from "next/link";
import { formatDateTimeJst } from "@/lib/dateTime";
import type { RecordType, SearchRecordResult } from "@/types/domain";

type SearchResultsProps = {
  results: SearchRecordResult[];
  query: string;
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

export function SearchResults({ results, query }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <p className="mt-6 text-sm text-gray-500">
        「{query}」に一致する結果はありません。
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-gray-600">
        {results.length}件の結果
      </p>
      <ul className="space-y-2">
        {results.map((result) => (
          <li key={result.id}>
            <Link
              href={`/conversations/${result.conversationId}?recordId=${result.id}`}
              className="block rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  {recordTypeLabels[result.recordType]}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDateTimeJst(result.postedAt)}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-gray-500">
                {result.conversationTitle}
              </p>
              {result.content && (
                <p className="mt-1 text-sm text-gray-700">
                  {truncate(result.content, 150)}
                </p>
              )}
              {result.title && !result.content && (
                <p className="mt-1 text-sm font-medium text-gray-700">
                  {truncate(result.title, 150)}
                </p>
              )}
              {!result.content && !result.title && (
                <p className="mt-1 text-sm text-gray-400">
                  ({recordTypeLabels[result.recordType]}ファイル)
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
