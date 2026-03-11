import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationCard } from "./ConversationCard";
import type { ConversationSummary } from "@/usecases/conversationUseCases";

const baseConversation: ConversationSummary = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  idolGroup: "nogizaka",
  coverImagePath: null,
  title: "テスト会話",
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-01-20T00:00:00Z",
  activeDays: 100,
};

describe("ConversationCard", () => {
  it("renders conversation title", () => {
    render(<ConversationCard conversation={baseConversation} />);

    expect(screen.getByText("テスト会話")).toBeInTheDocument();
  });

  it("renders active days", () => {
    render(<ConversationCard conversation={baseConversation} />);

    expect(screen.getByText("100日")).toBeInTheDocument();
  });

  it("links to conversation detail page", () => {
    render(<ConversationCard conversation={baseConversation} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/conversations/conv-1");
  });

  it("shows placeholder when no cover image", () => {
    render(<ConversationCard conversation={baseConversation} />);

    expect(screen.getByText("No Image")).toBeInTheDocument();
  });

  it("shows cover image when provided", () => {
    const conversation = {
      ...baseConversation,
      coverImagePath: "/images/cover.jpg",
    };
    render(<ConversationCard conversation={conversation} />);

    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("cover.jpg");
    expect(img).toHaveAttribute("alt", "テスト会話");
  });

  it("falls back to placeholder for non-local image paths", () => {
    const conversation = {
      ...baseConversation,
      coverImagePath: "https://example.com/cover.jpg",
    };
    render(<ConversationCard conversation={conversation} />);

    expect(screen.getByText("No Image")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
