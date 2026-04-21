import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResults } from "./SearchResults";
import type { SearchRecordResult } from "@/types/domain";

const baseResult: SearchRecordResult = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: null,
  content: "テストメッセージ内容",
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-01T10:00:00+09:00",
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  conversationTitle: "テスト会話",
};

describe("SearchResults", () => {
  it("shows empty message when no results", () => {
    render(<SearchResults results={[]} query="テスト" displayName="" />);

    expect(
      screen.getByText("「テスト」に一致する結果はありません。"),
    ).toBeInTheDocument();
  });

  it("shows result count", () => {
    render(<SearchResults results={[baseResult]} query="テスト" displayName="" />);

    expect(screen.getByText("1件の結果")).toBeInTheDocument();
  });

  it("renders result content", () => {
    render(<SearchResults results={[baseResult]} query="テスト" displayName="" />);

    expect(screen.getByText("テストメッセージ内容")).toBeInTheDocument();
  });

  it("renders conversation title", () => {
    render(<SearchResults results={[baseResult]} query="テスト" displayName="" />);

    expect(screen.getByText("テスト会話")).toBeInTheDocument();
  });

  it("renders record type badge", () => {
    render(<SearchResults results={[baseResult]} query="テスト" displayName="" />);

    expect(screen.getByText("テキスト")).toBeInTheDocument();
  });

  it("links to conversation with recordId", () => {
    render(<SearchResults results={[baseResult]} query="テスト" displayName="" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/conversations/conv-1?recordId=rec-1",
    );
  });

  it("shows title when content is absent", () => {
    const result = {
      ...baseResult,
      content: null,
      title: "レコードタイトル",
    };
    render(<SearchResults results={[result]} query="テスト" displayName="" />);

    expect(screen.getByText("レコードタイトル")).toBeInTheDocument();
  });

  it("shows file type placeholder when no content or title", () => {
    const result = {
      ...baseResult,
      content: null,
      title: null,
      recordType: "image" as const,
    };
    render(<SearchResults results={[result]} query="テスト" displayName="" />);

    expect(screen.getByText("(画像ファイル)")).toBeInTheDocument();
  });

  it("truncates long content", () => {
    const longContent = "あ".repeat(200);
    const result = { ...baseResult, content: longContent };
    render(<SearchResults results={[result]} query="テスト" displayName="" />);

    const truncated = "あ".repeat(150) + "…";
    expect(screen.getByText(truncated)).toBeInTheDocument();
  });

  it("renders multiple results", () => {
    const results = [
      baseResult,
      {
        ...baseResult,
        id: "rec-2",
        content: "二つ目の結果",
        conversationTitle: "別の会話",
      },
    ];
    render(<SearchResults results={results} query="テスト" displayName="" />);

    expect(screen.getByText("2件の結果")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
