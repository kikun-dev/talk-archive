import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatMessage } from "./ChatMessage";
import type { Record } from "@/types/domain";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  updateRecordAction: vi.fn(),
  deleteRecordAction: vi.fn(),
}));

const textRecord: Record = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: "テストタイトル",
  content: "テスト内容",
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-15T10:30:00Z",
  position: 0,
  createdAt: "2026-01-15T10:00:00Z",
  updatedAt: "2026-01-15T10:00:00Z",
};

const imageRecord: Record = {
  ...textRecord,
  id: "rec-2",
  recordType: "image",
};

describe("ChatMessage", () => {
  it("renders participant name and initial", () => {
    render(
      <ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      />,
    );

    expect(screen.getByText("メンバーA")).toBeInTheDocument();
    expect(screen.getByText("メ")).toBeInTheDocument();
  });

  it("renders record title and content", () => {
    render(
      <ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      />,
    );

    expect(screen.getByText("テストタイトル")).toBeInTheDocument();
    expect(screen.getByText("テスト内容")).toBeInTheDocument();
  });

  it("renders posted time", () => {
    render(
      <ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      />,
    );

    // postedAt "2026-01-15T10:30:00Z" → displayed as local time
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("switches to edit form when edit button is clicked", () => {
    render(
      <ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      />,
    );

    fireEvent.click(screen.getByText("編集"));

    expect(screen.getByLabelText("タイトル（任意）")).toBeInTheDocument();
    expect(screen.getByLabelText("テキスト")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "キャンセル" }),
    ).toBeInTheDocument();
  });

  it("returns to view mode when cancel is clicked", () => {
    render(
      <ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      />,
    );

    fireEvent.click(screen.getByText("編集"));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.getByText("テストタイトル")).toBeInTheDocument();
  });

  it("does not show edit button for non-text records", () => {
    render(
      <ChatMessage
        record={imageRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      />,
    );

    expect(screen.queryByText("編集")).not.toBeInTheDocument();
  });

  it("shows delete button for all record types", () => {
    render(
      <ChatMessage
        record={imageRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      />,
    );

    expect(screen.getByText("削除")).toBeInTheDocument();
  });

  it("has data-record-id attribute", () => {
    const { container } = render(
      <ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      />,
    );

    expect(
      container.querySelector('[data-record-id="rec-1"]'),
    ).toBeInTheDocument();
  });
});
