"use client";

import { useTransition } from "react";
import { deleteConversationAction } from "@/app/(app)/conversations/[id]/actions";
import { useToast } from "@/components/ToastProvider";

type DeleteConversationButtonProps = {
  conversationId: string;
};

export function DeleteConversationButton({
  conversationId,
}: DeleteConversationButtonProps) {
  const [isPending, startTransition] = useTransition();
  const { addToast } = useToast();

  function handleDelete() {
    if (!window.confirm("この会話を削除しますか？関連するレコードもすべて削除されます。")) {
      return;
    }

    startTransition(async () => {
      const result = await deleteConversationAction(conversationId);
      if (result?.error) {
        addToast(result.error, "error");
      }
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
