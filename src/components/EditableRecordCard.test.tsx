import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditableRecordCard } from "./EditableRecordCard";
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
  position: 0,
  createdAt: "2026-01-15T10:00:00Z",
  updatedAt: "2026-01-15T10:00:00Z",
};

const imageRecord: Record = {
  ...textRecord,
  id: "rec-2",
  recordType: "image",
};

describe("EditableRecordCard", () => {
  it("renders record with edit and delete buttons for text records", () => {
    render(
      <EditableRecordCard record={textRecord} conversationId="conv-1" />,
    );

    expect(screen.getByText("テストタイトル")).toBeInTheDocument();
    expect(screen.getByText("テスト内容")).toBeInTheDocument();
    expect(screen.getByText("編集")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
  });

  it("does not show edit button for non-text records", () => {
    render(
      <EditableRecordCard record={imageRecord} conversationId="conv-1" />,
    );

    expect(screen.queryByText("編集")).not.toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
  });

  it("switches to edit form when edit button is clicked", () => {
    render(
      <EditableRecordCard record={textRecord} conversationId="conv-1" />,
    );

    fireEvent.click(screen.getByText("編集"));

    expect(screen.getByLabelText("タイトル（任意）")).toBeInTheDocument();
    expect(screen.getByLabelText("テキスト")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "キャンセル" }),
    ).toBeInTheDocument();
  });

  it("populates edit form with current values", () => {
    render(
      <EditableRecordCard record={textRecord} conversationId="conv-1" />,
    );

    fireEvent.click(screen.getByText("編集"));

    expect(screen.getByDisplayValue("テストタイトル")).toBeInTheDocument();
    expect(screen.getByDisplayValue("テスト内容")).toBeInTheDocument();
  });

  it("returns to view mode when cancel is clicked", () => {
    render(
      <EditableRecordCard record={textRecord} conversationId="conv-1" />,
    );

    fireEvent.click(screen.getByText("編集"));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.getByText("テストタイトル")).toBeInTheDocument();
    expect(screen.getByText("編集")).toBeInTheDocument();
  });
});
