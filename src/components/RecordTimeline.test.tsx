import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordTimeline } from "./RecordTimeline";
import type { Record } from "@/types/domain";

const baseRecord: Record = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: "最初のトーク",
  content: "こんにちは",
  hasAudio: false,
  position: 0,
  createdAt: "2026-01-15T10:00:00Z",
  updatedAt: "2026-01-15T10:00:00Z",
};

describe("RecordTimeline", () => {
  it("renders empty state when no records", () => {
    render(<RecordTimeline records={[]} />);

    expect(
      screen.getByText("トークレコードがまだありません。"),
    ).toBeInTheDocument();
  });

  it("renders records", () => {
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
    render(<RecordTimeline records={records} />);

    expect(screen.getByText("最初のトーク")).toBeInTheDocument();
    expect(screen.getByText("こんにちは")).toBeInTheDocument();
    expect(screen.getByText("2番目のトーク")).toBeInTheDocument();
    expect(screen.getByText("お元気ですか")).toBeInTheDocument();
  });
});
