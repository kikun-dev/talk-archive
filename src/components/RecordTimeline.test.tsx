import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordTimeline } from "./RecordTimeline";
import { ToastProvider } from "./ToastProvider";
import type { Record } from "@/types/domain";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  updateRecordAction: vi.fn(),
  deleteRecordAction: vi.fn(),
}));

const baseRecord: Record = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: "最初のトーク",
  content: "こんにちは",
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-15T10:00:00Z",
  position: 0,
  createdAt: "2026-01-15T10:00:00Z",
  updatedAt: "2026-01-15T10:00:00Z",
};

describe("RecordTimeline", () => {
  it("renders empty state when no records", () => {
    render(<ToastProvider><RecordTimeline records={[]} conversationId="conv-1" /></ToastProvider>);

    expect(
      screen.getByText("トークレコードがまだありません。"),
    ).toBeInTheDocument();
  });

  it("renders records with edit and delete buttons", () => {
    const records = [
      baseRecord,
      {
        ...baseRecord,
        id: "rec-2",
        title: "2番目のトーク",
        content: "お元気ですか",
        position: 1,
      },
    ];
    render(<ToastProvider><RecordTimeline records={records} conversationId="conv-1" /></ToastProvider>);

    expect(screen.getByText("最初のトーク")).toBeInTheDocument();
    expect(screen.getByText("こんにちは")).toBeInTheDocument();
    expect(screen.getByText("2番目のトーク")).toBeInTheDocument();
    expect(screen.getByText("お元気ですか")).toBeInTheDocument();
    expect(screen.getAllByText("編集")).toHaveLength(2);
    expect(screen.getAllByText("削除")).toHaveLength(2);
  });
});
