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

  it("shows signed cover image URL when provided", () => {
    const conversation = {
      ...baseConversation,
      coverImagePath: "user-1/participants/participant-1/photo.jpg",
      coverImageUrl: "https://example.com/cover.jpg",
    };
    render(<ConversationCard conversation={conversation} />);

    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("cover.jpg");
    expect(img).toHaveAttribute("alt", "テスト会話");
  });

  it("uses compact mobile layout while preserving desktop card layout", () => {
    render(<ConversationCard conversation={baseConversation} />);

    expect(screen.getByRole("link")).toHaveClass(
      "rounded-md",
      "sm:rounded-lg",
    );
    expect(screen.getByTestId("conversation-card-thumbnail")).toHaveClass(
      "aspect-square",
      "sm:aspect-[16/9]",
    );
    expect(screen.getByTestId("conversation-card-title")).toHaveClass(
      "truncate",
      "text-xs",
      "sm:text-sm",
    );
  });

  it("keeps no-image placeholder inside square mobile thumbnail", () => {
    render(<ConversationCard conversation={baseConversation} />);

    expect(screen.getByTestId("conversation-card-thumbnail")).toContainElement(
      screen.getByText("No Image"),
    );
  });
});
