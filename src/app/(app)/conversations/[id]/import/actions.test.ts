import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const createSupabaseServerClientMock = vi.fn();

class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT: ${url}`);
  }
}

const redirectMock = vi.fn((url: string) => {
  throw new RedirectError(url);
});
const revalidatePathMock = vi.fn();

const parseTalkImportJsonMock = vi.fn();
const buildImportPreviewMock = vi.fn();
const executeImportMock = vi.fn();

class ImportErrorMock extends Error {}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/usecases/importUseCases", () => ({
  parseTalkImportJson: parseTalkImportJsonMock,
  buildImportPreview: buildImportPreviewMock,
  executeImport: executeImportMock,
  ImportError: ImportErrorMock,
}));

function mockSupabaseClient(user: { id: string } | null) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: { getUser: getUserMock },
  });
  getUserMock.mockResolvedValue({ data: { user } });
}

const validJsonText = JSON.stringify({
  version: 1,
  defaultYear: 2026,
  records: [
    {
      speaker: "瀬戸口 心月",
      postedAt: "2026-07-07T15:19:00+09:00",
      type: "text",
      content: "こんにちは",
    },
  ],
});

describe("previewTalkImportAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { previewTalkImportAction } = await import("./actions");
    await expect(
      previewTalkImportAction("conv-1", validJsonText),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns a preview merged with rowErrors on success", async () => {
    mockSupabaseClient({ id: "user-1" });
    const records = [{ speaker: "瀬戸口 心月" }];
    const rowErrors = ["2件目: 発言者を入力してください"];
    parseTalkImportJsonMock.mockReturnValue({
      records,
      defaultYear: 2026,
      rowErrors,
    });
    const preview = {
      totalCount: 1,
      importableCount: 1,
      duplicateCount: 0,
      period: null,
      typeCounts: { text: 1, image: 0, video: 0, audio: 0 },
      unknownSpeakers: [],
    };
    buildImportPreviewMock.mockResolvedValue(preview);

    const { previewTalkImportAction } = await import("./actions");
    const result = await previewTalkImportAction("conv-1", validJsonText);

    expect(parseTalkImportJsonMock).toHaveBeenCalledWith(validJsonText);
    expect(buildImportPreviewMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
      records,
    );
    expect(result).toEqual({ preview: { ...preview, rowErrors } });
  });

  it("passes through the ImportError message", async () => {
    mockSupabaseClient({ id: "user-1" });
    parseTalkImportJsonMock.mockImplementation(() => {
      throw new ImportErrorMock("対応していないバージョンです");
    });

    const { previewTalkImportAction } = await import("./actions");
    const result = await previewTalkImportAction("conv-1", validJsonText);

    expect(result).toEqual({ error: "対応していないバージョンです" });
    expect(buildImportPreviewMock).not.toHaveBeenCalled();
  });

  it("returns a generic error for unexpected failures", async () => {
    mockSupabaseClient({ id: "user-1" });
    parseTalkImportJsonMock.mockReturnValue({
      records: [],
      defaultYear: null,
      rowErrors: [],
    });
    buildImportPreviewMock.mockRejectedValue(new Error("boom"));

    const { previewTalkImportAction } = await import("./actions");
    const result = await previewTalkImportAction("conv-1", validJsonText);

    expect(result).toEqual({
      error:
        "インポートファイルの解析に失敗しました。時間をおいて再度お試しください。",
    });
  });
});

describe("executeTalkImportAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { executeTalkImportAction } = await import("./actions");
    await expect(
      executeTalkImportAction("conv-1", validJsonText, "{}"),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("re-parses jsonText and only imports rows without errors, then revalidates", async () => {
    mockSupabaseClient({ id: "user-1" });
    const validRecords = [{ speaker: "瀬戸口 心月" }];
    parseTalkImportJsonMock.mockReturnValue({
      records: validRecords,
      defaultYear: 2026,
      rowErrors: ["2件目: 発言者を入力してください"],
    });
    const importResult = {
      createdCount: 1,
      skippedCount: 0,
      createdParticipants: {},
    };
    executeImportMock.mockResolvedValue(importResult);

    const { executeTalkImportAction } = await import("./actions");
    const result = await executeTalkImportAction(
      "conv-1",
      validJsonText,
      JSON.stringify({ "瀬戸口 心月": "new" }),
    );

    expect(parseTalkImportJsonMock).toHaveBeenCalledWith(validJsonText);
    expect(executeImportMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
      {
        records: validRecords,
        speakerAssignments: { "瀬戸口 心月": "new" },
      },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
    expect(result).toEqual({ result: importResult });
  });

  it("returns an error when speakerAssignmentsJson is not valid JSON", async () => {
    mockSupabaseClient({ id: "user-1" });
    parseTalkImportJsonMock.mockReturnValue({
      records: [],
      defaultYear: null,
      rowErrors: [],
    });

    const { executeTalkImportAction } = await import("./actions");
    const result = await executeTalkImportAction(
      "conv-1",
      validJsonText,
      "not json",
    );

    expect(result).toEqual({ error: "発言者の割り当てのデータが不正です" });
    expect(executeImportMock).not.toHaveBeenCalled();
  });

  it("passes through the ImportError message", async () => {
    mockSupabaseClient({ id: "user-1" });
    parseTalkImportJsonMock.mockReturnValue({
      records: [{ speaker: "瀬戸口 心月" }],
      defaultYear: null,
      rowErrors: [],
    });
    executeImportMock.mockRejectedValue(
      new ImportErrorMock("発言者「瀬戸口 心月」の割り当てを指定してください"),
    );

    const { executeTalkImportAction } = await import("./actions");
    const result = await executeTalkImportAction("conv-1", validJsonText, "{}");

    expect(result).toEqual({
      error: "発言者「瀬戸口 心月」の割り当てを指定してください",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns a generic error for unexpected failures", async () => {
    mockSupabaseClient({ id: "user-1" });
    parseTalkImportJsonMock.mockReturnValue({
      records: [{ speaker: "瀬戸口 心月" }],
      defaultYear: null,
      rowErrors: [],
    });
    executeImportMock.mockRejectedValue(new Error("boom"));

    const { executeTalkImportAction } = await import("./actions");
    const result = await executeTalkImportAction("conv-1", validJsonText, "{}");

    expect(result).toEqual({
      error: "インポートに失敗しました。時間をおいて再度お試しください。",
    });
  });

  it("returns an error when jsonText itself fails to parse", async () => {
    mockSupabaseClient({ id: "user-1" });
    parseTalkImportJsonMock.mockImplementation(() => {
      throw new ImportErrorMock("JSONの形式が不正です");
    });

    const { executeTalkImportAction } = await import("./actions");
    const result = await executeTalkImportAction("conv-1", "not json", "{}");

    expect(result).toEqual({ error: "JSONの形式が不正です" });
    expect(executeImportMock).not.toHaveBeenCalled();
  });
});
