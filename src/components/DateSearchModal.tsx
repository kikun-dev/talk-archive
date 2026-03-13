"use client";

import { useState } from "react";
import { getDateKeyJst } from "@/lib/dateTime";
import type { ConversationParticipant, Record } from "@/types/domain";
import { DateSearchResults } from "@/components/DateSearchResults";

type DateSearchModalProps = {
  conversationId: string;
  participants: ConversationParticipant[];
  records: Record[];
  isOpen: boolean;
  onClose: () => void;
};

function validateDateInput(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return "日付の形式が不正です";
  }

  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return "日付の形式が不正です";
  }

  return null;
}

export function DateSearchModal({
  conversationId,
  participants,
  records,
  isOpen,
  onClose,
}: DateSearchModalProps) {
  const [selectedDate, setSelectedDate] = useState("");

  if (!isOpen) {
    return null;
  }

  const normalizedDate = selectedDate.trim();
  const validationError =
    normalizedDate.length > 0 ? validateDateInput(normalizedDate) : null;
  const matchedRecords =
    normalizedDate.length > 0 && validationError === null
      ? records.filter((record) => getDateKeyJst(record.postedAt) === normalizedDate)
      : null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-label="日付検索を閉じる"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="date-search-modal-title"
        className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="date-search-modal-title" className="text-lg font-semibold">
            日付検索
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="date-search-input"
              className="block text-sm font-medium text-gray-700"
            >
              日付を選択
            </label>
            <input
              id="date-search-input"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {validationError && (
          <p className="mt-4 text-sm text-red-600">{validationError}</p>
        )}

        {normalizedDate.length > 0 && matchedRecords && (
          <DateSearchResults
            conversationId={conversationId}
            records={matchedRecords}
            participants={participants}
            selectedDate={normalizedDate}
            onRecordSelect={onClose}
          />
        )}
      </div>
    </div>
  );
}
