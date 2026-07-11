import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TalkImportForm } from "./TalkImportForm";
import type { ConversationParticipant } from "@/types/domain";
import { MAX_IMPORT_FILE_SIZE } from "@/usecases/importUseCases";
import { MAX_EML_FILE_SIZE } from "@/usecases/emlImportUseCases";
import type {
  PreviewTalkImportResult,
  ExecuteTalkImportResult,
  PreviewEmlImportResult,
  ExecuteEmlImportResult,
} from "@/app/(app)/conversations/[id]/import/actions";

const previewTalkImportActionMock = vi.fn<
  (conversationId: string, jsonText: string) => Promise<PreviewTalkImportResult>
>();
const executeTalkImportActionMock = vi.fn<
  (
    conversationId: string,
    jsonText: string,
    speakerAssignmentsJson: string,
  ) => Promise<ExecuteTalkImportResult>
>();
const previewEmlImportActionMock = vi.fn<
  (conversationId: string, formData: FormData) => Promise<PreviewEmlImportResult>
>();
const executeEmlImportActionMock = vi.fn<
  (
    conversationId: string,
    formData: FormData,
    senderAssignmentsJson: string,
  ) => Promise<ExecuteEmlImportResult>
>();

vi.mock("@/app/(app)/conversations/[id]/import/actions", () => ({
  previewTalkImportAction: (...args: unknown[]) =>
    previewTalkImportActionMock(
      ...(args as [string, string]),
    ),
  executeTalkImportAction: (...args: unknown[]) =>
    executeTalkImportActionMock(
      ...(args as [string, string, string]),
    ),
  previewEmlImportAction: (...args: unknown[]) =>
    previewEmlImportActionMock(...(args as [string, FormData])),
  executeEmlImportAction: (...args: unknown[]) =>
    executeEmlImportActionMock(...(args as [string, FormData, string])),
}));

const participants: ConversationParticipant[] = [
  {
    id: "part-1",
    conversationId: "conv-1",
    name: "メンバーA",
    sortOrder: 0,
    thumbnailPath: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

function selectJsonFile(text: string, name = "talk.json") {
  const input = screen.getByLabelText("インポートするJSONファイル");
  const file = new File([text], name, { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
}

function switchToEmlMode() {
  fireEvent.click(screen.getByRole("button", { name: "メール（.eml）" }));
}

function selectEmlFiles(files: File[]) {
  const input = screen.getByLabelText("インポートする.emlファイル");
  fireEvent.change(input, { target: { files } });
}

function emlFile(name = "mail1.eml") {
  return new File(["raw"], name, { type: "message/rfc822" });
}

/** File の size を Object.defineProperty で偽装する（実データは確保しない、#128） */
function emlFileWithSize(name: string, size: number): File {
  const file = new File(["raw"], name, { type: "message/rfc822" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const basePreview: PreviewTalkImportResult = {
  preview: {
    totalCount: 5,
    importableCount: 3,
    duplicateCount: 2,
    period: {
      start: "2026-01-01T01:00:00Z",
      end: "2026-01-05T01:00:00Z",
    },
    typeCounts: { text: 2, image: 1, video: 0, audio: 0 },
    unknownSpeakers: [],
    rowErrors: [],
  },
};

const baseEmlPreview: PreviewEmlImportResult = {
  preview: {
    totalCount: 3,
    importableCount: 2,
    duplicateCount: 1,
    period: {
      start: "2026-01-01T01:00:00Z",
      end: "2026-01-03T01:00:00Z",
    },
    typeCounts: { text: 1, image: 1, video: 0, audio: 0 },
    unknownSpeakers: ["taro@example.com"],
    rowErrors: [],
    senders: [
      { address: "taro@example.com", nameSuggestion: "太郎", messageCount: 2 },
    ],
    imageCount: 1,
    extraImageWarnings: [],
  },
};

describe("TalkImportForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the file selection input initially", () => {
    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    expect(
      screen.getByLabelText("インポートするJSONファイル"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("JSON形式・最大5MB・5,000件まで"),
    ).toBeInTheDocument();
    expect(screen.getByText("ファイルを選択")).toBeInTheDocument();
  });

  it("shows preview counts, period, type breakdown and row errors after preview succeeds", async () => {
    previewTalkImportActionMock.mockResolvedValue({
      preview: {
        ...basePreview.preview!,
        rowErrors: ["3件目: 発言者を入力してください"],
      },
    });

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    selectJsonFile('{"version":1,"records":[]}');

    await waitFor(() =>
      expect(previewTalkImportActionMock).toHaveBeenCalledWith(
        "conv-1",
        '{"version":1,"records":[]}',
      ),
    );

    expect(
      await screen.findByLabelText("総件数: 5件（うち行エラー 1件）"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("取り込み対象: 3件")).toBeInTheDocument();
    expect(
      screen.getByLabelText("重複スキップ予定: 2件"),
    ).toBeInTheDocument();
    expect(screen.getByText("対象ファイル: talk.json")).toBeInTheDocument();
    expect(screen.getByText(/テキスト 2/)).toBeInTheDocument();
    expect(screen.getByText(/画像 1/)).toBeInTheDocument();
    expect(
      screen.getByText("以下の行は取り込まれません"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3件目: 発言者を入力してください"),
    ).toBeInTheDocument();
  });

  it("shows the total count without a row-error suffix when there are no row errors", async () => {
    previewTalkImportActionMock.mockResolvedValue(basePreview);

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    selectJsonFile('{"version":1,"records":[]}');

    expect(await screen.findByLabelText("総件数: 5件")).toBeInTheDocument();
  });

  it("rejects a file over MAX_IMPORT_FILE_SIZE without calling the preview action, and resets the input", async () => {
    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    const initialInput = screen.getByLabelText("インポートするJSONファイル");
    const oversizedFile = new File(
      [new Uint8Array(MAX_IMPORT_FILE_SIZE + 1)],
      "too-big.json",
      { type: "application/json" },
    );
    fireEvent.change(initialInput, { target: { files: [oversizedFile] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ファイルサイズは5MB以内にしてください",
    );
    expect(previewTalkImportActionMock).not.toHaveBeenCalled();
    // ファイル選択 input が再マウントされ、選択状態がクリアされている
    expect(screen.getByLabelText("インポートするJSONファイル")).not.toBe(
      initialInput,
    );
  });

  it("shows unknown speaker selects defaulting to new participant", async () => {
    previewTalkImportActionMock.mockResolvedValue({
      preview: {
        ...basePreview.preview!,
        unknownSpeakers: ["新しい発言者"],
      },
    });

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    selectJsonFile('{"version":1,"records":[]}');

    const select = await screen.findByLabelText("新しい発言者の割り当て");
    expect(select).toHaveValue("new");
    expect(screen.getByRole("option", { name: "メンバーA" })).toBeInTheDocument();
  });

  it("disables the execute button when importableCount is 0", async () => {
    previewTalkImportActionMock.mockResolvedValue({
      preview: {
        ...basePreview.preview!,
        importableCount: 0,
      },
    });

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    selectJsonFile('{"version":1,"records":[]}');

    const executeButton = await screen.findByRole("button", {
      name: "インポート実行",
    });
    expect(executeButton).toBeDisabled();
    expect(
      screen.getByText("取り込める新しいトークがありません"),
    ).toBeInTheDocument();
  });

  it("shows the result screen after a successful execution", async () => {
    previewTalkImportActionMock.mockResolvedValue(basePreview);
    executeTalkImportActionMock.mockResolvedValue({
      result: {
        createdCount: 3,
        skippedCount: 2,
        createdParticipants: { "新しい発言者": "part-new-1" },
        createdRecords: [],
      },
    });

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    selectJsonFile('{"version":1,"records":[]}');

    const executeButton = await screen.findByRole("button", {
      name: "インポート実行",
    });
    expect(executeButton).not.toBeDisabled();
    fireEvent.click(executeButton);

    await waitFor(() =>
      expect(executeTalkImportActionMock).toHaveBeenCalledWith(
        "conv-1",
        '{"version":1,"records":[]}',
        expect.any(String),
      ),
    );

    expect(await screen.findByLabelText("作成件数: 3件")).toBeInTheDocument();
    expect(screen.getByLabelText("スキップ件数: 2件")).toBeInTheDocument();
    expect(
      screen.getByText("新規追加された参加者: 新しい発言者"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "トークに戻る" }),
    ).toHaveAttribute("href", "/conversations/conv-1");
  });

  it("returns to file selection when やり直す is clicked", async () => {
    previewTalkImportActionMock.mockResolvedValue(basePreview);

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    selectJsonFile('{"version":1,"records":[]}');

    await screen.findByRole("button", { name: "インポート実行" });
    fireEvent.click(screen.getByRole("button", { name: "やり直す" }));

    expect(
      screen.getByLabelText("インポートするJSONファイル"),
    ).toBeInTheDocument();
  });

  it("shows a FormError when preview fails", async () => {
    previewTalkImportActionMock.mockResolvedValue({
      error: "JSONの形式が不正です",
    });

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    selectJsonFile("not valid json");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "JSONの形式が不正です",
    );
  });

  it("shows a mode toggle and switches to the .eml file input in mail mode", () => {
    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    expect(screen.getByRole("button", { name: "JSON" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "メール（.eml）" }),
    ).toHaveAttribute("aria-pressed", "false");

    switchToEmlMode();

    const input = screen.getByLabelText("インポートする.emlファイル");
    expect(input).toHaveAttribute("multiple");
    expect(input).toHaveAttribute("accept", ".eml,message/rfc822");
    expect(
      screen.queryByLabelText("インポートするJSONファイル"),
    ).not.toBeInTheDocument();
  });

  it("resets error state when switching from JSON mode to mail mode", async () => {
    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );

    const oversizedFile = new File(
      [new Uint8Array(MAX_IMPORT_FILE_SIZE + 1)],
      "too-big.json",
      { type: "application/json" },
    );
    fireEvent.change(screen.getByLabelText("インポートするJSONファイル"), {
      target: { files: [oversizedFile] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ファイルサイズは5MB以内にしてください",
    );

    switchToEmlMode();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows sender assignment selects defaulting to new participant in mail mode preview", async () => {
    previewEmlImportActionMock.mockResolvedValue(baseEmlPreview);

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );
    switchToEmlMode();
    const file = emlFile();
    selectEmlFiles([file]);

    await waitFor(() =>
      expect(previewEmlImportActionMock).toHaveBeenCalledTimes(1),
    );
    const [calledConversationId, calledFormData] =
      previewEmlImportActionMock.mock.calls[0];
    expect(calledConversationId).toBe("conv-1");
    expect(calledFormData.getAll("files")).toEqual([file]);

    const select = await screen.findByLabelText(
      "taro@example.comの割り当て",
    );
    expect(select).toHaveValue("new");
    expect(
      screen.getByText(/太郎（taro@example\.com）/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "メンバーA" }),
    ).toBeInTheDocument();
  });

  it("shows the image count and extra image warnings in mail mode preview", async () => {
    previewEmlImportActionMock.mockResolvedValue({
      preview: {
        ...baseEmlPreview.preview!,
        extraImageWarnings: [
          "mail1.eml: 2枚目以降の画像 1枚は取り込まれません",
        ],
      },
    });

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );
    switchToEmlMode();
    selectEmlFiles([emlFile()]);

    expect(
      await screen.findByLabelText("画像付きメール数: 1件"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2枚目以降の画像は取り込まれません"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("mail1.eml: 2枚目以降の画像 1枚は取り込まれません"),
    ).toBeInTheDocument();
  });

  it("shows attach results and pending-attachment guidance when an attachment fails in mail mode", async () => {
    previewEmlImportActionMock.mockResolvedValue(baseEmlPreview);
    executeEmlImportActionMock.mockResolvedValue({
      result: {
        createdCount: 2,
        skippedCount: 1,
        createdParticipants: { 太郎: "part-new-1" },
        createdRecords: [],
        attachedCount: 1,
        attachFailedCount: 1,
      },
    });

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );
    switchToEmlMode();
    selectEmlFiles([emlFile()]);

    const executeButton = await screen.findByRole("button", {
      name: "インポート実行",
    });
    fireEvent.click(executeButton);

    await waitFor(() =>
      expect(executeEmlImportActionMock).toHaveBeenCalledWith(
        "conv-1",
        expect.any(FormData),
        expect.any(String),
      ),
    );

    expect(
      await screen.findByLabelText("画像添付成功: 1件"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("画像添付失敗: 1件")).toBeInTheDocument();
    expect(
      screen.getByText(
        "未添付のまま取り込まれたため、タイムラインの未添付バッジから添付できます",
      ),
    ).toBeInTheDocument();
  });

  it("does not show the pending-attachment guidance when there are no attach failures in mail mode", async () => {
    previewEmlImportActionMock.mockResolvedValue(baseEmlPreview);
    executeEmlImportActionMock.mockResolvedValue({
      result: {
        createdCount: 2,
        skippedCount: 1,
        createdParticipants: {},
        createdRecords: [],
        attachedCount: 1,
        attachFailedCount: 0,
      },
    });

    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );
    switchToEmlMode();
    selectEmlFiles([emlFile()]);

    fireEvent.click(
      await screen.findByRole("button", { name: "インポート実行" }),
    );

    expect(
      await screen.findByLabelText("画像添付成功: 1件"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "未添付のまま取り込まれたため、タイムラインの未添付バッジから添付できます",
      ),
    ).not.toBeInTheDocument();
  });

  it("rejects more than MAX_EML_FILE_COUNT files without calling the preview action", async () => {
    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );
    switchToEmlMode();

    const files = Array.from({ length: 201 }, (_, index) =>
      emlFile(`mail${index}.eml`),
    );
    selectEmlFiles(files);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "一度にインポートできるのは200件までです。ファイルを分割してください",
    );
    expect(previewEmlImportActionMock).not.toHaveBeenCalled();
  });

  it("rejects a file over MAX_EML_FILE_SIZE without calling the preview action, and resets the input", async () => {
    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );
    switchToEmlMode();

    const initialInput = screen.getByLabelText("インポートする.emlファイル");
    const oversizedFile = new File(
      [new Uint8Array(MAX_EML_FILE_SIZE + 1)],
      "big.eml",
      { type: "message/rfc822" },
    );
    fireEvent.change(initialInput, { target: { files: [oversizedFile] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "big.eml: ファイルサイズは10MB以内にしてください",
    );
    expect(previewEmlImportActionMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("インポートする.emlファイル")).not.toBe(
      initialInput,
    );
  });

  it("rejects files whose total size exceeds MAX_EML_TOTAL_SIZE without calling the preview action, and resets the input (#128)", async () => {
    render(
      <TalkImportForm conversationId="conv-1" participants={participants} />,
    );
    switchToEmlMode();

    const initialInput = screen.getByLabelText("インポートする.emlファイル");
    // 各9MB(<=10MB) x 6件 = 54MB > 50MB
    const files = Array.from({ length: 6 }, (_, index) =>
      emlFileWithSize(`mail${index}.eml`, 9 * 1024 * 1024),
    );
    fireEvent.change(initialInput, { target: { files } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ファイルの合計サイズは50MB以内にしてください。ファイルを分割してください",
    );
    expect(previewEmlImportActionMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("インポートする.emlファイル")).not.toBe(
      initialInput,
    );
  });
});
