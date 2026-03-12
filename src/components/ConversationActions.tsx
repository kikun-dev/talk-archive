"use client";

import { useState } from "react";
import { ConversationHeader } from "@/components/ConversationHeader";
import { EditConversationForm } from "@/components/EditConversationForm";
import { DeleteConversationButton } from "@/components/DeleteConversationButton";
import type { ConversationWithMetadata } from "@/usecases/conversationUseCases";

type ConversationActionsProps = {
  conversation: ConversationWithMetadata;
  defaultEditing?: boolean;
};

export function ConversationActions({
  conversation,
  defaultEditing = false,
}: ConversationActionsProps) {
  const [isEditing, setIsEditing] = useState(defaultEditing);

  if (isEditing) {
    return (
      <EditConversationForm
        conversation={conversation}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div>
      <ConversationHeader conversation={conversation} />
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          編集
        </button>
        <DeleteConversationButton conversationId={conversation.id} />
      </div>
    </div>
  );
}
