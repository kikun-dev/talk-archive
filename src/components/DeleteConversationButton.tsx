"use client";

import { useTransition } from "react";
import { deleteConversationAction } from "@/app/(app)/conversations/[id]/actions";

type DeleteConversationButtonProps = {
  conversationId: string;
};

export function DeleteConversationButton({
  conversationId,
}: DeleteConversationButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("この会話を削除しますか？関連するレコードもすべて削除されます。")) {
      return;
    }

    startTransition(async () => {
      await deleteConversationAction(conversationId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      {isPending ? "削除中..." : "会話を削除"}
    </button>
  );
}
