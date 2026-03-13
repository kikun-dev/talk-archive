"use client";

import type { ConversationParticipantInput } from "@/usecases/conversationUseCases";

type ParticipantFieldsProps = {
  participants: ConversationParticipantInput[];
  onChange: (participants: ConversationParticipantInput[]) => void;
};

export function ParticipantFields({
  participants,
  onChange,
}: ParticipantFieldsProps) {
  function addParticipant() {
    onChange([...participants, { name: "" }]);
  }

  function removeParticipant(index: number) {
    onChange(participants.filter((_, i) => i !== index));
  }

  function updateParticipant(index: number, value: string) {
    onChange(
      participants.map((participant, i) =>
        i === index ? { ...participant, name: value } : participant,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="block text-sm font-medium">参加者</span>
        <button
          type="button"
          onClick={addParticipant}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          + 参加者を追加
        </button>
      </div>

      {participants.length === 0 && (
        <p className="text-xs text-gray-500">参加者を追加してください</p>
      )}

      {participants.map((participant, index) => (
        <div key={participant.id ?? `new-${index}`} className="flex items-center gap-2">
          <input
            type="text"
            value={participant.name}
            aria-label={`参加者${index + 1}の名前`}
            onChange={(e) => updateParticipant(index, e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="参加者名"
            required
          />
          {!participant.id && (
            <button
              type="button"
              aria-label={`参加者${index + 1}を削除`}
              onClick={() => removeParticipant(index)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              削除
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
