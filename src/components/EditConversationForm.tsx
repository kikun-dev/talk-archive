"use client";

import { useActionState, useState } from "react";
import {
  updateConversationAction,
  type ActionState,
} from "@/app/(app)/conversations/[id]/actions";
import { ActivePeriodFields } from "@/components/ActivePeriodFields";
import { ParticipantFields } from "@/components/ParticipantFields";
import type { ConversationWithMetadata } from "@/usecases/conversationUseCases";
import type {
  ConversationActivePeriodInput,
  ConversationParticipantInput,
} from "@/usecases/conversationUseCases";

type EditConversationFormProps = {
  conversation: ConversationWithMetadata;
  onCancel: () => void;
};

export function EditConversationForm({
  conversation,
  onCancel,
}: EditConversationFormProps) {
  const [activePeriods, setActivePeriods] = useState<
    ConversationActivePeriodInput[]
  >(
    conversation.activePeriods.map((p) => ({
      startDate: p.startDate,
      endDate: p.endDate,
    })),
  );
  const [participants, setParticipants] = useState<
    ConversationParticipantInput[]
  >(conversation.participants.map((p) => ({ id: p.id, name: p.name })));

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (_prevState, formData) => {
      const result = await updateConversationAction(
        conversation.id,
        _prevState,
        formData,
      );
      if (!result?.error) {
        onCancel();
      }
      return result;
    },
    undefined,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="edit-title" className="block text-sm font-medium">
          タイトル
        </label>
        <input
          id="edit-title"
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={conversation.title}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="edit-idolGroup" className="block text-sm font-medium">
          グループ
        </label>
        <select
          id="edit-idolGroup"
          name="idolGroup"
          required
          defaultValue={conversation.idolGroup}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="nogizaka">乃木坂46</option>
          <option value="sakurazaka">櫻坂46</option>
          <option value="hinatazaka">日向坂46</option>
        </select>
      </div>

      <ActivePeriodFields
        periods={activePeriods}
        onChange={setActivePeriods}
      />
      <ParticipantFields
        participants={participants}
        onChange={setParticipants}
      />

      <input
        type="hidden"
        name="activePeriods"
        value={JSON.stringify(activePeriods)}
      />
      <input
        type="hidden"
        name="participants"
        value={JSON.stringify(participants)}
      />

      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
