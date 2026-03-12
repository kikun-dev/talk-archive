import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordCard } from "./RecordCard";
import type { Record } from "@/types/domain";

const baseRecord: Record = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: "テストタイトル",
  content: "テスト内容です",
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-15T10:30:00Z",
  position: 0,
  createdAt: "2026-01-15T10:30:00Z",
  updatedAt: "2026-01-15T10:30:00Z",
};

describe("RecordCard", () => {
  it("renders record type icon for text", () => {
    render(<RecordCard record={baseRecord} />);

    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("renders record type icon for image", () => {
    render(
      <RecordCard record={{ ...baseRecord, recordType: "image" }} />,
    );

    expect(screen.getByText("I")).toBeInTheDocument();
  });

  it("renders record type icon for video", () => {
    render(
      <RecordCard record={{ ...baseRecord, recordType: "video" }} />,
    );

    expect(screen.getByText("V")).toBeInTheDocument();
  });

  it("renders record type icon for audio", () => {
    render(
      <RecordCard record={{ ...baseRecord, recordType: "audio" }} />,
    );

    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders title when present", () => {
    render(<RecordCard record={baseRecord} />);

    expect(screen.getByText("テストタイトル")).toBeInTheDocument();
  });

  it("does not render title when null", () => {
    render(<RecordCard record={{ ...baseRecord, title: null }} />);

    expect(screen.queryByText("テストタイトル")).not.toBeInTheDocument();
  });

  it("renders content", () => {
    render(<RecordCard record={baseRecord} />);

    expect(screen.getByText("テスト内容です")).toBeInTheDocument();
  });

  it("does not render content when null", () => {
    render(<RecordCard record={{ ...baseRecord, content: null }} />);

    expect(screen.queryByText("テスト内容です")).not.toBeInTheDocument();
  });

  it("renders formatted timestamp", () => {
    render(<RecordCard record={baseRecord} />);

    // タイムスタンプが表示されることを確認（ロケール依存のため部分一致）
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
