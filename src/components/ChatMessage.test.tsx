import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ChatMessage } from "./ChatMessage";
import { ToastProvider } from "./ToastProvider";
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
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
    );

    expect(screen.getByText("メンバーA")).toBeInTheDocument();
    expect(screen.getByText("メ")).toBeInTheDocument();
  });

  it("renders record title and content", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
    );

    expect(screen.getByText("テストタイトル")).toBeInTheDocument();
    expect(screen.getByText("テスト内容")).toBeInTheDocument();
  });

  it("renders posted time", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
    );

    expect(screen.getByText("19:30")).toBeInTheDocument();
  });

  it("switches to edit form when edit button is clicked", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
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
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
    );

    fireEvent.click(screen.getByText("編集"));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.getByText("テストタイトル")).toBeInTheDocument();
  });

  it("does not show edit button for non-text records", () => {
    render(
      <ToastProvider><ChatMessage
        record={imageRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
    );

    expect(screen.queryByText("編集")).not.toBeInTheDocument();
  });

  it("shows delete button for all record types", () => {
    render(
      <ToastProvider><ChatMessage
        record={imageRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
    );

    expect(screen.getByText("削除")).toBeInTheDocument();
  });

  it("has data-record-id attribute", () => {
    const { container } = render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
    );

    expect(
      container.querySelector('[data-record-id="rec-1"]'),
    ).toBeInTheDocument();
  });

  it("keeps action menu available without relying on hover", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
      /></ToastProvider>,
    );

    const actionButton = screen.getByRole("button", { name: "操作" });
    expect(actionButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(actionButton);

    const menu = screen.getByRole("menu", { name: "レコード操作" });
    expect(actionButton).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByText("編集")).toBeInTheDocument();
    expect(within(menu).getByText("削除")).toBeInTheDocument();
  });
});
