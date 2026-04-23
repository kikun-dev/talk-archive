import { memo } from "react";
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

export const ConversationCard = memo(function ConversationCard({ conversation }: ConversationCardProps) {
  const coverImageSrc =
    conversation.coverImageUrl ??
    (canRenderConversationCoverImage(conversation.coverImagePath)
      ? conversation.coverImagePath
      : null);

  return (
    <Link
      href={`/conversations/${conversation.id}`}
      className="block overflow-hidden rounded-md border border-gray-200 hover:shadow-md sm:rounded-lg"
    >
      <div
        data-testid="conversation-card-thumbnail"
        className="relative aspect-square bg-gray-100 sm:aspect-[16/9]"
      >
        {coverImageSrc ? (
          <Image
            src={coverImageSrc}
            alt={conversation.title}
            unoptimized
            fill
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-gray-400 sm:text-2xl">
            No Image
          </div>
        )}
      </div>
      <div className="px-1 py-1 sm:px-3 sm:py-2">
        <p
          data-testid="conversation-card-title"
          className="truncate text-xs font-medium sm:text-sm"
        >
          {conversation.title}
        </p>
        <p className="hidden mt-0.5 text-xs text-gray-500 sm:block">
          {conversation.activeDays}日
        </p>
      </div>
    </Link>
  );
});
