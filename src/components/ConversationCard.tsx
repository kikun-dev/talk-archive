import Image from "next/image";
import Link from "next/link";
import type { ConversationSummary } from "@/usecases/conversationUseCases";

type ConversationCardProps = {
  conversation: ConversationSummary;
};

function canRenderConversationCoverImage(
  coverImagePath: string | null,
): coverImagePath is string {
  return (
    typeof coverImagePath === "string" &&
    coverImagePath.startsWith("/") &&
    !coverImagePath.startsWith("//")
  );
}

export function ConversationCard({ conversation }: ConversationCardProps) {
  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className="block overflow-hidden rounded-lg border border-gray-200 hover:shadow-md"
    >
      <div className="relative aspect-[16/9] bg-gray-100">
        {canRenderConversationCoverImage(conversation.coverImagePath) ? (
          <Image
            src={conversation.coverImagePath}
            alt={conversation.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-gray-400">
            No Image
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium">{conversation.title}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {conversation.activeDays}日
        </p>
      </div>
    </Link>
  );
}
