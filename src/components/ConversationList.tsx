import Link from "next/link";
import { formatDateJst } from "@/lib/dateTime";
import type { Conversation } from "@/types/domain";

type ConversationListProps = {
  conversations: Conversation[];
};

export function ConversationList({ conversations }: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        会話がまだありません。新しい会話を作成してください。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`/conversations/${conversation.id}`}
            className="block rounded border border-gray-200 px-4 py-3 hover:bg-gray-50"
          >
            <span className="font-medium">{conversation.title}</span>
            <span className="ml-2 text-xs text-gray-400">
              {formatDateJst(conversation.updatedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
