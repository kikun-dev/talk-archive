"use client";

import { useActionState, useState } from "react";
import {
  createConversationAction,
  type CreateConversationState,
} from "@/app/(app)/conversations/new/actions";
import { ActivePeriodFields } from "@/components/ActivePeriodFields";
import type { ConversationActivePeriodInput } from "@/usecases/conversationUseCases";
import type { Source } from "@/types/domain";

type NewConversationFormProps = {
  sources: Source[];
};

export function NewConversationForm({ sources }: NewConversationFormProps) {
  const [activePeriods, setActivePeriods] = useState<
    ConversationActivePeriodInput[]
  >([{ startDate: "", endDate: null }]);

  const [state, formAction, isPending] = useActionState<
    CreateConversationState,
    FormData
  >(async (_prevState, formData) => {
    return await createConversationAction(_prevState, formData);
  }, undefined);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          タイトル
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="idolGroup" className="block text-sm font-medium">
          グループ
        </label>
        <select
          id="idolGroup"
          name="idolGroup"
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">選択してください</option>
          <option value="nogizaka">乃木坂46</option>
          <option value="sakurazaka">櫻坂46</option>
          <option value="hinatazaka">日向坂46</option>
        </select>
      </div>

      <div>
        <label htmlFor="sourceId" className="block text-sm font-medium">
          トークの出所
        </label>
        <select
          id="sourceId"
          name="sourceId"
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">なし</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>

      <ActivePeriodFields
        periods={activePeriods}
        onChange={setActivePeriods}
      />

      <input
        type="hidden"
        name="activePeriods"
        value={JSON.stringify(activePeriods)}
      />

      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "作成中..." : "作成"}
      </button>
    </form>
  );
}
