import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ChatMessage } from "./ChatMessage";
import { ToastProvider } from "./ToastProvider";
import type { Record } from "@/types/domain";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  updateRecordAction: vi.fn(),
  deleteRecordAction: vi.fn(),
  attachRecordMediaAction: vi.fn(),
}));

import { attachRecordMediaAction } from "@/app/(app)/conversations/[id]/actions";

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
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders participant name and initial", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    expect(screen.getByText("メンバーA")).toBeInTheDocument();
    expect(screen.getByText("メ")).toBeInTheDocument();
  });

  it("renders participant thumbnail when provided", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        participantThumbnailUrl="https://example.com/member-a.jpg"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    const img = screen.getByRole("img", { name: "メンバーAのサムネイル" });
    expect(img.getAttribute("src")).toContain("member-a.jpg");
    expect(screen.queryByText("メ")).not.toBeInTheDocument();
  });

  it("renders record title and content", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    expect(screen.getByText("テストタイトル")).toBeInTheDocument();
    expect(screen.getByText("テスト内容")).toBeInTheDocument();
  });

  it("renders posted date time without year for current-year records", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00Z"));

    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    expect(screen.getByText("01/15(木) 19:30")).toBeInTheDocument();
  });

  it("renders posted date time inline with participant name", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00Z"));

    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    const metaRow = screen.getByTestId("message-meta-row");
    expect(metaRow).toHaveClass("flex", "items-baseline", "gap-2");
    expect(within(metaRow).getByText("メンバーA")).toBeInTheDocument();
    expect(within(metaRow).getByText("01/15(木) 19:30")).toBeInTheDocument();
  });

  it("keeps edit actions below the bubble in edit mode", () => {
    const { container } = render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        isEditMode
        displayName=""
      /></ToastProvider>,
    );

    const bubble = screen.getByText("テスト内容").closest("div");
    const editActions = screen.getByTestId("message-edit-actions");

    expect(bubble?.compareDocumentPosition(editActions)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      within(editActions).getByRole("button", { name: "操作" }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-testid="message-edit-actions"]')).not
      .toBeNull();
  });

  it("switches to edit form when edit button is clicked", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        isEditMode
        displayName=""
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
        isEditMode
        displayName=""
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
        displayName=""
      /></ToastProvider>,
    );

    expect(screen.queryByText("編集")).not.toBeInTheDocument();
  });

  it("shows action trigger for all record types in edit mode", () => {
    render(
      <ToastProvider><ChatMessage
        record={imageRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        isEditMode
        displayName=""
      /></ToastProvider>,
    );

    expect(screen.getByRole("button", { name: "操作" })).toBeInTheDocument();
  });

  it("has data-record-id attribute", () => {
    const { container } = render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    expect(
      container.querySelector('[data-record-id="rec-1"]'),
    ).toBeInTheDocument();
  });

  it("keeps action menu available in edit mode without relying on hover", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        isEditMode
        displayName=""
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

  it("hides action menu trigger outside edit mode", () => {
    render(
      <ToastProvider><ChatMessage
        record={textRecord}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    expect(screen.queryByRole("button", { name: "操作" })).toBeNull();
  });

  it("replaces {{MY_NAME}} in content with displayName", () => {
    const record = {
      ...textRecord,
      content: "こんにちは{{MY_NAME}}さん",
      title: "{{MY_NAME}}へのメッセージ",
    };
    render(
      <ToastProvider><ChatMessage
        record={record}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName="太郎"
      /></ToastProvider>,
    );

    expect(screen.getByText("こんにちは太郎さん")).toBeInTheDocument();
    expect(screen.getByText("太郎へのメッセージ")).toBeInTheDocument();
  });

  it("shows raw placeholder when displayName is empty", () => {
    const record = {
      ...textRecord,
      content: "こんにちは{{MY_NAME}}さん",
    };
    render(
      <ToastProvider><ChatMessage
        record={record}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    expect(
      screen.getByText("こんにちは{{MY_NAME}}さん"),
    ).toBeInTheDocument();
  });

  it("renders a URL in content as a clickable link", () => {
    const record = {
      ...textRecord,
      content: "資料はこちら https://example.com/doc をどうぞ",
    };
    render(
      <ToastProvider><ChatMessage
        record={record}
        participantName="メンバーA"
        conversationId="conv-1"
        displayName=""
      /></ToastProvider>,
    );

    const link = screen.getByRole("link", {
      name: "https://example.com/doc",
    });
    expect(link).toHaveAttribute("href", "https://example.com/doc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows raw placeholder in edit mode textarea", () => {
    const record = {
      ...textRecord,
      content: "こんにちは{{MY_NAME}}さん",
    };
    render(
      <ToastProvider><ChatMessage
        record={record}
        participantName="メンバーA"
        conversationId="conv-1"
        isEditMode
        displayName="太郎"
      /></ToastProvider>,
    );

    fireEvent.click(screen.getByText("編集"));

    expect(screen.getByLabelText("テキスト")).toHaveValue(
      "こんにちは{{MY_NAME}}さん",
    );
  });

  // --- メディア未添付レコード（#113） ---

  const pendingVideoRecord: Record = {
    ...textRecord,
    id: "rec-pend-1",
    recordType: "video",
    title: null,
    content: null,
  };

  function renderPending(record: Record = pendingVideoRecord) {
    return render(
      <ToastProvider>
        <ChatMessage
          record={record}
          participantName="メンバーA"
          conversationId="conv-1"
          displayName=""
          isPendingMedia
        />
      </ToastProvider>,
    );
  }

  it("shows a pending badge for media records without attachment", () => {
    renderPending();

    expect(screen.getByText("動画未添付")).toBeInTheDocument();
  });

  it("does not show a pending badge when not pending", () => {
    render(
      <ToastProvider>
        <ChatMessage
          record={pendingVideoRecord}
          participantName="メンバーA"
          conversationId="conv-1"
          displayName=""
        />
      </ToastProvider>,
    );

    expect(screen.queryByText("動画未添付")).not.toBeInTheDocument();
  });

  it("reveals an attach form with type-scoped accept when the attach button is clicked", () => {
    renderPending();

    expect(screen.queryByLabelText("添付ファイル")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ファイルを添付" }));

    const fileInput = screen.getByLabelText("添付ファイル");
    expect(fileInput).toHaveAttribute("accept", "video/*");
    expect(
      screen.getByRole("button", { name: "添付する" }),
    ).toBeInTheDocument();
  });

  it("uses an image accept filter for pending image records", () => {
    renderPending({ ...pendingVideoRecord, recordType: "image" });

    expect(screen.getByText("画像未添付")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ファイルを添付" }));
    expect(screen.getByLabelText("添付ファイル")).toHaveAttribute(
      "accept",
      "image/*",
    );
  });

  it("hides the attach form when cancelled", () => {
    renderPending();

    fireEvent.click(screen.getByRole("button", { name: "ファイルを添付" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByLabelText("添付ファイル")).not.toBeInTheDocument();
  });

  it("shows a validation error and blocks submission when the selected file is the wrong type", () => {
    renderPending();

    fireEvent.click(screen.getByRole("button", { name: "ファイルを添付" }));
    const fileInput = screen.getByLabelText("添付ファイル");

    const wrongTypeFile = new File(["data"], "photo.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [wrongTypeFile] } });

    expect(
      screen.getByText("動画ファイルを選択してください"),
    ).toBeInTheDocument();
    expect(fileInput).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "添付する" }));

    expect(vi.mocked(attachRecordMediaAction)).not.toHaveBeenCalled();
  });

  it("shows a validation error when the selected file exceeds the size limit", () => {
    renderPending();

    fireEvent.click(screen.getByRole("button", { name: "ファイルを添付" }));
    const fileInput = screen.getByLabelText("添付ファイル");

    const oversizedFile = new File(["data"], "video.mp4", {
      type: "video/mp4",
    });
    Object.defineProperty(oversizedFile, "size", {
      value: 50 * 1024 * 1024 + 1,
    });
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    expect(
      screen.getByText("ファイルサイズは50MB以内にしてください"),
    ).toBeInTheDocument();
    expect(fileInput).toHaveValue("");
  });

  it("clears the validation error once a valid file is selected", () => {
    renderPending();

    fireEvent.click(screen.getByRole("button", { name: "ファイルを添付" }));
    const fileInput = screen.getByLabelText("添付ファイル");

    fireEvent.change(fileInput, {
      target: { files: [new File(["data"], "photo.jpg", { type: "image/jpeg" })] },
    });
    expect(
      screen.getByText("動画ファイルを選択してください"),
    ).toBeInTheDocument();

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["data"], "video.mp4", { type: "video/mp4" })],
      },
    });

    expect(
      screen.queryByText("動画ファイルを選択してください"),
    ).not.toBeInTheDocument();
  });
});
