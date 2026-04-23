import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationHeader } from "./ConversationHeader";
import type { ConversationWithMetadata } from "@/usecases/conversationUseCases";

const baseConversation: ConversationWithMetadata = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  idolGroup: "nogizaka",
  coverImagePath: null,
  title: "テスト会話",
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-01-20T00:00:00Z",
  activePeriods: [
    {
      id: "period-1",
      conversationId: "conv-1",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      createdAt: "2026-01-15T00:00:00Z",
    },
  ],
  participants: [
    {
      id: "part-1",
      conversationId: "conv-1",
      name: "メンバーA",
      sortOrder: 0,
      thumbnailPath: null,
      createdAt: "2026-01-15T00:00:00Z",
    },
  ],
  activeDays: 181,
};

describe("ConversationHeader", () => {
  it("renders conversation title", () => {
    render(<ConversationHeader conversation={baseConversation} />);

    expect(screen.getByText("テスト会話")).toBeInTheDocument();
  });

  it("renders idol group label", () => {
    render(<ConversationHeader conversation={baseConversation} />);

    expect(screen.getByText("乃木坂46")).toBeInTheDocument();
  });

  it("renders participant names", () => {
    render(<ConversationHeader conversation={baseConversation} />);

    expect(screen.getByText("メンバーA")).toBeInTheDocument();
  });

  it("renders multiple participant names joined", () => {
    const conversation: ConversationWithMetadata = {
      ...baseConversation,
      participants: [
        { ...baseConversation.participants[0], name: "メンバーA" },
        {
          id: "part-2",
          conversationId: "conv-1",
          name: "メンバーB",
          sortOrder: 1,
          thumbnailPath: null,
          createdAt: "2026-01-15T00:00:00Z",
        },
      ],
    };
    render(<ConversationHeader conversation={conversation} />);

    expect(screen.getByText("メンバーA、メンバーB")).toBeInTheDocument();
  });

  it("renders active days", () => {
    render(<ConversationHeader conversation={baseConversation} />);

    expect(screen.getByText("181日")).toBeInTheDocument();
  });

  it("renders active period with end date", () => {
    render(<ConversationHeader conversation={baseConversation} />);

    expect(
      screen.getByText("2026-01-01 〜 2026-06-30"),
    ).toBeInTheDocument();
  });

  it("renders ongoing period", () => {
    const conversation: ConversationWithMetadata = {
      ...baseConversation,
      activePeriods: [
        { ...baseConversation.activePeriods[0], endDate: null },
      ],
    };
    render(<ConversationHeader conversation={conversation} />);

    expect(screen.getByText("2026-01-01 〜 継続中")).toBeInTheDocument();
  });

  it("renders creation date", () => {
    render(<ConversationHeader conversation={baseConversation} />);

    expect(screen.getByText("2026/01/15")).toBeInTheDocument();
  });
});
