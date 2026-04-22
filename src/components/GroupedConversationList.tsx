"use client";

import { useState } from "react";
import type { IdolGroup } from "@/types/domain";
import type { ConversationSummary } from "@/usecases/conversationUseCases";
import { ConversationCard } from "@/components/ConversationCard";

type GroupedConversationListProps = {
  conversations: ConversationSummary[];
};

const groups: { value: IdolGroup; label: string }[] = [
  { value: "nogizaka", label: "乃木坂46" },
  { value: "sakurazaka", label: "櫻坂46" },
  { value: "hinatazaka", label: "日向坂46" },
];

export function GroupedConversationList({
  conversations,
}: GroupedConversationListProps) {
  const [selectedGroup, setSelectedGroup] = useState<IdolGroup>("nogizaka");

  const filtered = conversations.filter(
    (c) => c.idolGroup === selectedGroup,
  );

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200">
        {groups.map((group) => (
          <button
            key={group.value}
            type="button"
            aria-pressed={selectedGroup === group.value}
            onClick={() => setSelectedGroup(group.value)}
            className={`px-4 py-2 text-sm font-medium ${
              selectedGroup === group.value
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {group.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">
            このグループの会話はまだありません。
          </p>
        ) : (
          <div
            data-testid="conversation-grid"
            className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
          >
            {filtered.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
