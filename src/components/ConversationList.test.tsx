import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationList } from "./ConversationList";
import type { Conversation } from "@/types/domain";

const baseConversation: Conversation = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  title: "テスト会話",
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-01-20T00:00:00Z",
};

describe("ConversationList", () => {
  it("renders empty state when no conversations", () => {
    render(<ConversationList conversations={[]} />);

    expect(
      screen.getByText(
        "会話がまだありません。新しい会話を作成してください。",
      ),
    ).toBeInTheDocument();
  });

  it("renders conversation titles as links", () => {
    const conversations = [
      baseConversation,
      { ...baseConversation, id: "conv-2", title: "2番目の会話" },
    ];
    render(<ConversationList conversations={conversations} />);

    const link1 = screen.getByRole("link", { name: /テスト会話/ });
    expect(link1).toHaveAttribute("href", "/conversations/conv-1");

    const link2 = screen.getByRole("link", { name: /2番目の会話/ });
    expect(link2).toHaveAttribute("href", "/conversations/conv-2");
  });

  it("displays formatted update date", () => {
    render(<ConversationList conversations={[baseConversation]} />);

    expect(screen.getByText("2026/01/20")).toBeInTheDocument();
  });
});
