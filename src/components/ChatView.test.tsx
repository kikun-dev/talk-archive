import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ChatView } from "./ChatView";
import { ToastProvider } from "./ToastProvider";
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
  updateParticipantThumbnailAction: vi.fn(),
  updateConversationCoverImageAction: vi.fn(),
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
      thumbnailPath: null,
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
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    expect(screen.getByText("テスト会話")).toBeInTheDocument();
  });

  it("renders record content", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    expect(screen.getByText("最初のメッセージ")).toBeInTheDocument();
    expect(screen.getByText("二番目のメッセージ")).toBeInTheDocument();
  });

  it("uses wider spacing between messages", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    expect(screen.getByTestId("message-list")).toHaveClass("space-y-5");
  });

  it("renders participant name with messages", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    const participantLabels = screen.getAllByText("メンバーA");
    expect(participantLabels.length).toBeGreaterThan(0);
  });

  it("shows empty state when no records", () => {
    const emptyConversation = { ...conversation, records: [] };
    render(<ToastProvider><ChatView conversation={emptyConversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    expect(
      screen.getByText("トークレコードがまだありません。"),
    ).toBeInTheDocument();
  });

  it("shows search bar when search button is clicked", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    fireEvent.click(screen.getByLabelText("検索"));

    expect(
      screen.getByPlaceholderText("会話内を検索"),
    ).toBeInTheDocument();
  });

  it("shows search results count", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    fireEvent.click(screen.getByLabelText("検索"));
    fireEvent.change(screen.getByPlaceholderText("会話内を検索"), {
      target: { value: "メッセージ" },
    });

    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("shows no match message", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    fireEvent.click(screen.getByLabelText("検索"));
    fireEvent.change(screen.getByPlaceholderText("会話内を検索"), {
      target: { value: "存在しないテキスト" },
    });

    expect(screen.getByText("一致なし")).toBeInTheDocument();
  });

  it("shows overflow menu when menu button is clicked", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    fireEvent.click(screen.getByLabelText("メニュー"));

    expect(screen.getByRole("link", { name: "概要" })).toHaveAttribute(
      "href",
      "/conversations/conv-1/overview",
    );
    expect(
      screen.getByRole("button", { name: "日付検索" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "会話内メディア一覧" }),
    ).toHaveAttribute("href", "/conversations/conv-1/media");
    expect(
      screen.getByRole("button", { name: "会話編集" }),
    ).toBeInTheDocument();
  });

  it("renders back link", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    expect(screen.getByLabelText("戻る")).toBeInTheDocument();
  });

  it("renders composer", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    expect(screen.getByText("テキスト")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("hides composer on mobile while not in edit mode and keeps it visible on desktop", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    expect(screen.getByTestId("chat-composer-container")).toHaveClass(
      "hidden",
      "sm:block",
    );
  });

  it("shows composer on mobile when edit mode is enabled", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "会話編集" }));

    expect(screen.getByTestId("chat-composer-container")).toHaveClass("block");
    expect(screen.getByTestId("chat-composer-container")).not.toHaveClass(
      "hidden",
    );
  });

  it("opens date search modal from overflow menu", async () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "日付検索" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("日付を選択")).toBeInTheDocument();
  });

  it("filters records by selected date in the modal", async () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "日付検索" }));

    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("日付を選択"), {
      target: { value: "2026-01-01" },
    });

    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText("1件のレコード")).toBeInTheDocument();
    expect(within(dialog).getByText("最初のメッセージ")).toBeInTheDocument();
    expect(
      within(dialog).queryByText("二番目のメッセージ"),
    ).not.toBeInTheDocument();
  });

  it("enters edit mode from overflow menu", () => {
    render(<ToastProvider><ChatView conversation={conversation} mediaUrls={{}} displayName="" /></ToastProvider>);

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "会話編集" }));

    expect(
      screen.getByText("編集モード中です。各レコードの操作メニューから編集・削除できます。"),
    ).toBeInTheDocument();
    expect(screen.getByText("サムネイル")).toBeInTheDocument();
    expect(screen.getByLabelText("メンバーAのサムネイル画像")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "操作" }).length).toBeGreaterThan(0);
  });

  it("passes participant thumbnail URL to messages", () => {
    render(
      <ToastProvider>
        <ChatView
          conversation={conversation}
          mediaUrls={{}}
          participantThumbnailUrls={{
            "part-1": "https://example.com/member-a.jpg",
          }}
          displayName=""
        />
      </ToastProvider>,
    );

    expect(
      screen.getAllByRole("img", { name: "メンバーAのサムネイル" }).length,
    ).toBeGreaterThan(0);
  });
});
