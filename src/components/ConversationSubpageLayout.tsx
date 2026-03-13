import Link from "next/link";
import type { ReactNode } from "react";

type ConversationSubpageLayoutProps = {
  conversationId: string;
  title: string;
  description?: string;
  children?: ReactNode;
};

export function ConversationSubpageLayout({
  conversationId,
  title,
  description,
  children,
}: ConversationSubpageLayoutProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Link
          href={`/conversations/${conversationId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          戻る
        </Link>
        <h1 className="text-xl font-bold leading-tight">{title}</h1>
      </div>

      {description && (
        <p className="mb-4 text-sm text-gray-600">{description}</p>
      )}

      {children}
    </div>
  );
}
