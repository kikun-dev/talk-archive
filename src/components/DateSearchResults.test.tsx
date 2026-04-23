import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateSearchResults } from "./DateSearchResults";
import type { ConversationParticipant, Record } from "@/types/domain";

const participants: ConversationParticipant[] = [
  {
    id: "part-1",
    conversationId: "conv-1",
    name: "メンバーA",
    sortOrder: 0,
    thumbnailPath: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "part-2",
    conversationId: "conv-1",
    name: "メンバーB",
    sortOrder: 1,
    thumbnailPath: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const baseRecord: Record = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: null,
  content: "テストメッセージ",
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-01T10:00:00+09:00",
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("DateSearchResults", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows empty message when no records", () => {
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(
      screen.getByText("2026-01-01 のレコードはありません。"),
    ).toBeInTheDocument();
  });

  it("shows record count", () => {
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[baseRecord]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(screen.getByText("1件のレコード")).toBeInTheDocument();
  });

  it("renders record content", () => {
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[baseRecord]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(screen.getByText("テストメッセージ")).toBeInTheDocument();
  });

  it("renders record type badge", () => {
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[baseRecord]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(screen.getByText("テキスト")).toBeInTheDocument();
  });

  it("renders participant name", () => {
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[baseRecord]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(screen.getByText("メンバーA")).toBeInTheDocument();
  });

  it("renders posted date time without year for current-year records", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00Z"));

    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[baseRecord]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(screen.getByText("01/01(木) 10:00")).toBeInTheDocument();
  });

  it("shows unknown for missing participant", () => {
    const record = { ...baseRecord, speakerParticipantId: "unknown-id" };
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[record]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(screen.getByText("不明")).toBeInTheDocument();
  });

  it("links to conversation with recordId", () => {
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[baseRecord]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/conversations/conv-1?recordId=rec-1",
    );
  });

  it("shows title when content is absent", () => {
    const record = {
      ...baseRecord,
      content: null,
      title: "画像タイトル",
      recordType: "image" as const,
    };
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[record]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(screen.getByText("画像タイトル")).toBeInTheDocument();
  });

  it("shows file type placeholder when no content or title", () => {
    const record = {
      ...baseRecord,
      content: null,
      title: null,
      recordType: "image" as const,
    };
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[record]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    expect(screen.getByText("(画像ファイル)")).toBeInTheDocument();
  });

  it("truncates long content", () => {
    const longContent = "あ".repeat(150);
    const record = { ...baseRecord, content: longContent };
    render(
      <DateSearchResults
        conversationId="conv-1"
        records={[record]}
        participants={participants}
        selectedDate="2026-01-01"
        displayName=""
      />,
    );

    const truncated = "あ".repeat(100) + "…";
    expect(screen.getByText(truncated)).toBeInTheDocument();
  });
});
