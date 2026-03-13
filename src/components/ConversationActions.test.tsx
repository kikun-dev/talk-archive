import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationActions } from "./ConversationActions";
import { ToastProvider } from "./ToastProvider";
import type { ConversationWithMetadata } from "@/usecases/conversationUseCases";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  updateConversationAction: vi.fn(),
  deleteConversationAction: vi.fn(),
}));

const conversation: ConversationWithMetadata = {
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
      createdAt: "2026-01-15T00:00:00Z",
    },
  ],
  activeDays: 181,
};

describe("ConversationActions", () => {
  it("renders header with edit and delete buttons", () => {
    render(<ToastProvider><ConversationActions conversation={conversation} /></ToastProvider>);

    expect(screen.getByText("テスト会話")).toBeInTheDocument();
    expect(screen.getByText("編集")).toBeInTheDocument();
    expect(screen.getByText("会話を削除")).toBeInTheDocument();
  });

  it("switches to edit form when edit button is clicked", () => {
    render(<ToastProvider><ConversationActions conversation={conversation} /></ToastProvider>);

    fireEvent.click(screen.getByText("編集"));

    expect(screen.getByLabelText("タイトル")).toBeInTheDocument();
    expect(screen.getByLabelText("グループ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "キャンセル" }),
    ).toBeInTheDocument();
  });

  it("returns to header view when cancel is clicked", () => {
    render(<ToastProvider><ConversationActions conversation={conversation} /></ToastProvider>);

    fireEvent.click(screen.getByText("編集"));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.getByText("テスト会話")).toBeInTheDocument();
    expect(screen.getByText("編集")).toBeInTheDocument();
  });
});
