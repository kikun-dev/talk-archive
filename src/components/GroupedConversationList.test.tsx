import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupedConversationList } from "./GroupedConversationList";
import type { ConversationSummary } from "@/usecases/conversationUseCases";

const baseConversation: ConversationSummary = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  idolGroup: "nogizaka",
  coverImagePath: null,
  title: "乃木坂の会話",
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-01-20T00:00:00Z",
  activeDays: 100,
};

const conversations: ConversationSummary[] = [
  baseConversation,
  {
    ...baseConversation,
    id: "conv-2",
    idolGroup: "nogizaka",
    title: "乃木坂の別の会話",
    activeDays: 50,
  },
  {
    ...baseConversation,
    id: "conv-3",
    idolGroup: "sakurazaka",
    title: "櫻坂の会話",
    activeDays: 200,
  },
  {
    ...baseConversation,
    id: "conv-4",
    idolGroup: "hinatazaka",
    title: "日向坂の会話",
    activeDays: 150,
  },
];

describe("GroupedConversationList", () => {
  it("renders group tabs", () => {
    render(<GroupedConversationList conversations={conversations} />);

    expect(screen.getByText("乃木坂46")).toBeInTheDocument();
    expect(screen.getByText("櫻坂46")).toBeInTheDocument();
    expect(screen.getByText("日向坂46")).toBeInTheDocument();
  });

  it("shows nogizaka conversations by default", () => {
    render(<GroupedConversationList conversations={conversations} />);

    expect(screen.getByText("乃木坂の会話")).toBeInTheDocument();
    expect(screen.getByText("乃木坂の別の会話")).toBeInTheDocument();
    expect(screen.queryByText("櫻坂の会話")).not.toBeInTheDocument();
    expect(screen.queryByText("日向坂の会話")).not.toBeInTheDocument();
  });

  it("switches to sakurazaka group on tab click", () => {
    render(<GroupedConversationList conversations={conversations} />);

    fireEvent.click(screen.getByText("櫻坂46"));

    expect(screen.queryByText("乃木坂の会話")).not.toBeInTheDocument();
    expect(screen.getByText("櫻坂の会話")).toBeInTheDocument();
  });

  it("switches to hinatazaka group on tab click", () => {
    render(<GroupedConversationList conversations={conversations} />);

    fireEvent.click(screen.getByText("日向坂46"));

    expect(screen.getByText("日向坂の会話")).toBeInTheDocument();
  });

  it("shows empty state for group with no conversations", () => {
    render(
      <GroupedConversationList
        conversations={[baseConversation]}
      />,
    );

    fireEvent.click(screen.getByText("櫻坂46"));

    expect(
      screen.getByText("このグループの会話はまだありません。"),
    ).toBeInTheDocument();
  });

  it("shows empty state when no conversations at all", () => {
    render(<GroupedConversationList conversations={[]} />);

    expect(
      screen.getByText("このグループの会話はまだありません。"),
    ).toBeInTheDocument();
  });
});
