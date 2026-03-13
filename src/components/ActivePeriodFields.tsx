"use client";

import type { ConversationActivePeriodInput } from "@/usecases/conversationUseCases";

type ActivePeriodFieldsProps = {
  periods: ConversationActivePeriodInput[];
  onChange: (periods: ConversationActivePeriodInput[]) => void;
};

export function ActivePeriodFields({
  periods,
  onChange,
}: ActivePeriodFieldsProps) {
  function addPeriod() {
    onChange([...periods, { startDate: "", endDate: null }]);
  }

  function removePeriod(index: number) {
    onChange(periods.filter((_, i) => i !== index));
  }

  function updatePeriod(
    index: number,
    field: "startDate" | "endDate",
    value: string,
  ) {
    const updated = periods.map((period, i) => {
      if (i !== index) return period;
      if (field === "endDate") {
        return { ...period, endDate: value || null };
      }
      return { ...period, [field]: value };
    });
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="block text-sm font-medium">会話期間</span>
        <button
          type="button"
          onClick={addPeriod}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          + 期間を追加
        </button>
      </div>

      {periods.length === 0 && (
        <p className="text-xs text-gray-500">
          期間を追加してください
        </p>
      )}

      {periods.map((period, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="date"
            value={period.startDate}
            aria-label={`期間${index + 1}の開始日`}
            onChange={(e) =>
              updatePeriod(index, "startDate", e.target.value)
            }
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            required
          />
          <span className="text-sm text-gray-500">〜</span>
          <input
            type="date"
            value={period.endDate ?? ""}
            aria-label={`期間${index + 1}の終了日`}
            onChange={(e) =>
              updatePeriod(index, "endDate", e.target.value)
            }
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="継続中"
          />
          <button
            type="button"
            aria-label={`期間${index + 1}を削除`}
            onClick={() => removePeriod(index)}
            className="text-xs text-red-500 hover:text-red-700"
          >
            削除
          </button>
        </div>
      ))}
    </div>
  );
}
