import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TalkImportForm } from "./TalkImportForm";
import type { ConversationParticipant } from "@/types/domain";
import { MAX_IMPORT_FILE_SIZE } from "@/usecases/importUseCases";
import type {
  PreviewTalkImportResult,
  ExecuteTalkImportResult,
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

vi.mock("@/app/(app)/conversations/[id]/import/actions", () => ({
  previewTalkImportAction: (...args: unknown[]) =>
    previewTalkImportActionMock(
      ...(args as [string, string]),
    ),
  executeTalkImportAction: (...args: unknown[]) =>
    executeTalkImportActionMock(
      ...(args as [string, string, string]),
    ),
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
});
