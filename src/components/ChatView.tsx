"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateHeaderJst, getDateKeyJst } from "@/lib/dateTime";
import type { ConversationParticipant, Record } from "@/types/domain";
import type { ConversationWithRecords } from "@/usecases/conversationUseCases";
import type { MediaUrl } from "@/usecases/recordUseCases";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatComposer } from "@/components/ChatComposer";
import { DateSearchModal } from "@/components/DateSearchModal";

type ChatViewProps = {
  conversation: ConversationWithRecords;
  mediaUrls: { [recordId: string]: MediaUrl };
};

function buildParticipantMap(
  participants: ConversationParticipant[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of participants) {
    map.set(p.id, p.name);
  }
  return map;
}

function groupRecordsByDate(
  records: Record[],
): Array<{ dateKey: string; dateLabel: string; records: Record[] }> {
  const groups: Array<{
    dateKey: string;
    dateLabel: string;
    records: Record[];
  }> = [];
  let currentDateKey = "";

  for (const record of records) {
    const dateKey = getDateKeyJst(record.postedAt);
    if (dateKey !== currentDateKey) {
      currentDateKey = dateKey;
      groups.push({
        dateKey,
        dateLabel: formatDateHeaderJst(record.postedAt),
        records: [],
      });
    }
    groups[groups.length - 1].records.push(record);
  }

  return groups;
}

function searchRecordsLocal(
  records: Record[],
  query: string,
): string[] {
  if (query.trim().length === 0) return [];
  const lowerQuery = query.toLowerCase();
  return records
    .filter(
      (r) =>
        r.content?.toLowerCase().includes(lowerQuery) ||
        r.title?.toLowerCase().includes(lowerQuery),
    )
    .map((r) => r.id);
}

export function ChatView({ conversation, mediaUrls }: ChatViewProps) {
  const participantMap = buildParticipantMap(conversation.participants);
  const dateGroups = groupRecordsByDate(conversation.records);
  const searchParams = useSearchParams();
  const targetRecordId = searchParams.get("recordId");

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDateSearchOpen, setIsDateSearchOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);

  const timelineRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const matchedIds = searchRecordsLocal(conversation.records, searchQuery);

  const scrollToRecord = useCallback((recordId: string) => {
    const el = timelineRef.current?.querySelector(
      `[data-record-id="${recordId}"]`,
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  useEffect(() => {
    if (matchedIds.length > 0 && matchIndex < matchedIds.length) {
      scrollToRecord(matchedIds[matchIndex]);
    }
  }, [matchedIds, matchIndex, scrollToRecord]);

  function handleSearchToggle() {
    setIsSearchOpen((prev) => {
      if (!prev) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      } else {
        setSearchQuery("");
        setMatchIndex(0);
      }
      return !prev;
    });
  }

  function handleSearchNav(direction: "prev" | "next") {
    if (matchedIds.length === 0) return;
    setMatchIndex((prev) => {
      if (direction === "next") {
        return (prev + 1) % matchedIds.length;
      }
      return (prev - 1 + matchedIds.length) % matchedIds.length;
    });
  }

  // Scroll to target record or bottom on initial load
  useEffect(() => {
    if (targetRecordId) {
      scrollToRecord(targetRecordId);
    } else if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [targetRecordId, scrollToRecord]);

  return (
    <div className="-m-4 flex min-h-[calc(100dvh-4rem)] flex-col bg-gray-100 sm:-m-6 lg:h-[100dvh] lg:min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-3 sm:px-4">
        <Link
          href="/"
          className="text-gray-500 hover:text-gray-700"
          aria-label="戻る"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
        </Link>

        <h1 className="min-w-0 flex-1 truncate text-sm font-bold">
          {conversation.title}
        </h1>

        <button
          type="button"
          onClick={handleSearchToggle}
          className="text-gray-500 hover:text-gray-700"
          aria-label="検索"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="text-gray-500 hover:text-gray-700"
            aria-label="メニュー"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
            </svg>
          </button>

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setIsMenuOpen(false);
                }}
              >
                <Link
                  role="menuitem"
                  href={`/conversations/${conversation.id}/overview`}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  概要
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsDateSearchOpen(true);
                  }}
                >
                  日付検索
                </button>
                <Link
                  role="menuitem"
                  href={`/conversations/${conversation.id}/media`}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  会話内メディア一覧
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsEditMode((prev) => !prev);
                  }}
                >
                  {isEditMode ? "編集モードを終了" : "会話編集"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {isEditMode && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:px-4">
          <span>編集モード中です。各レコードの操作メニューから編集・削除できます。</span>
          <button
            type="button"
            onClick={() => setIsEditMode(false)}
            className="shrink-0 rounded border border-amber-300 px-2 py-1 text-xs hover:bg-amber-100"
          >
            終了
          </button>
        </div>
      )}

      {/* Search Bar */}
      {isSearchOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 sm:px-4">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setMatchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") handleSearchToggle();
            }}
            placeholder="会話内を検索"
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          {matchedIds.length > 0 && (
            <>
              <span className="text-xs text-gray-500">
                {matchIndex + 1}/{matchedIds.length}
              </span>
              <button
                type="button"
                aria-label="前の検索結果"
                onClick={() => handleSearchNav("prev")}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label="次の検索結果"
                onClick={() => handleSearchNav("next")}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ▼
              </button>
            </>
          )}
          {searchQuery && matchedIds.length === 0 && (
            <span className="text-xs text-gray-400">一致なし</span>
          )}
        </div>
      )}

      {/* Timeline */}
      <div ref={timelineRef} className="flex-1 overflow-y-auto py-4">
        {conversation.records.length === 0 ? (
          <p className="px-4 text-center text-sm text-gray-500">
            トークレコードがまだありません。
          </p>
        ) : (
          dateGroups.map((group) => (
            <div key={group.dateKey}>
              <div className="space-y-3">
                {group.records.map((record) => (
                  <ChatMessage
                    key={record.id}
                    record={record}
                    participantName={
                      participantMap.get(record.speakerParticipantId) ?? "不明"
                    }
                    conversationId={conversation.id}
                    mediaUrl={mediaUrls[record.id]}
                    isEditMode={isEditMode}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <ChatComposer
        conversationId={conversation.id}
        participants={conversation.participants}
      />

      <DateSearchModal
        conversationId={conversation.id}
        participants={conversation.participants}
        records={conversation.records}
        isOpen={isDateSearchOpen}
        onClose={() => setIsDateSearchOpen(false)}
      />
    </div>
  );
}
