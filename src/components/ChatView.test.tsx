import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatView } from "./ChatView";
import type { ConversationWithRecords } from "@/usecases/conversationUseCases";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  updateRecordAction: vi.fn(),
  deleteRecordAction: vi.fn(),
  addTextRecordAction: vi.fn(),
  addImageRecordAction: vi.fn(),
  addVideoRecordAction: vi.fn(),
  addAudioRecordAction: vi.fn(),
}));

const conversation: ConversationWithRecords = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  idolGroup: "nogizaka",
  coverImagePath: null,
  title: "テスト会話",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  activePeriods: [
    {
      id: "period-1",
      conversationId: "conv-1",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  participants: [
    {
      id: "part-1",
      conversationId: "conv-1",
      name: "メンバーA",
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  activeDays: 10,
  records: [
    {
      id: "rec-1",
      conversationId: "conv-1",
      recordType: "text",
      title: null,
      content: "最初のメッセージ",
      hasAudio: false,
      speakerParticipantId: "part-1",
      postedAt: "2026-01-01T10:00:00Z",
      position: 0,
      createdAt: "2026-01-01T10:00:00Z",
      updatedAt: "2026-01-01T10:00:00Z",
    },
    {
      id: "rec-2",
      conversationId: "conv-1",
      recordType: "text",
      title: null,
      content: "二番目のメッセージ",
      hasAudio: false,
      speakerParticipantId: "part-1",
      postedAt: "2026-01-02T14:00:00Z",
      position: 1,
      createdAt: "2026-01-02T14:00:00Z",
      updatedAt: "2026-01-02T14:00:00Z",
    },
  ],
};

describe("ChatView", () => {
  it("renders conversation title in header", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    expect(screen.getByText("テスト会話")).toBeInTheDocument();
  });

  it("renders record content", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    expect(screen.getByText("最初のメッセージ")).toBeInTheDocument();
    expect(screen.getByText("二番目のメッセージ")).toBeInTheDocument();
  });

  it("renders participant name with messages", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    const participantLabels = screen.getAllByText("メンバーA");
    expect(participantLabels.length).toBeGreaterThan(0);
  });

  it("shows empty state when no records", () => {
    const emptyConversation = { ...conversation, records: [] };
    render(<ChatView conversation={emptyConversation} mediaUrls={{}} />);

    expect(
      screen.getByText("トークレコードがまだありません。"),
    ).toBeInTheDocument();
  });

  it("shows search bar when search button is clicked", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    fireEvent.click(screen.getByLabelText("検索"));

    expect(
      screen.getByPlaceholderText("会話内を検索"),
    ).toBeInTheDocument();
  });

  it("shows search results count", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    fireEvent.click(screen.getByLabelText("検索"));
    fireEvent.change(screen.getByPlaceholderText("会話内を検索"), {
      target: { value: "メッセージ" },
    });

    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows no match message", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    fireEvent.click(screen.getByLabelText("検索"));
    fireEvent.change(screen.getByPlaceholderText("会話内を検索"), {
      target: { value: "存在しないテキスト" },
    });

    expect(screen.getByText("一致なし")).toBeInTheDocument();
  });

  it("shows overflow menu when menu button is clicked", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    fireEvent.click(screen.getByLabelText("メニュー"));

    expect(screen.getByRole("link", { name: "概要" })).toHaveAttribute(
      "href",
      "/conversations/conv-1/overview",
    );
    expect(screen.getByRole("link", { name: "日付検索" })).toHaveAttribute(
      "href",
      "/conversations/conv-1/dates",
    );
    expect(
      screen.getByRole("link", { name: "会話内メディア一覧" }),
    ).toHaveAttribute("href", "/conversations/conv-1/media");
    expect(screen.getByRole("link", { name: "会話編集" })).toHaveAttribute(
      "href",
      "/conversations/conv-1/edit",
    );
  });

  it("renders back link", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    expect(screen.getByLabelText("戻る")).toBeInTheDocument();
  });

  it("renders composer", () => {
    render(<ChatView conversation={conversation} mediaUrls={{}} />);

    expect(screen.getByText("テキスト")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });
});
