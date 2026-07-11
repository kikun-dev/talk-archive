import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const parseEmlFileMock = vi.fn();
const toTalkImportRecordMock = vi.fn();
const fetchRemoteImagesForImportMock = vi.fn();
const guessImageFilenameMock = vi.fn((mimeType: string, index: number) => {
  const subtype = mimeType.split("/")[1]?.split("+")[0] || "bin";
  return `image-${index + 1}.${subtype}`;
});

class EmlImportErrorMock extends Error {}

const attachRecordMediaMock = vi.fn();

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
  MAX_IMPORT_FILE_SIZE: 5 * 1024 * 1024,
}));

vi.mock("@/usecases/emlImportUseCases", () => ({
  parseEmlFile: parseEmlFileMock,
  toTalkImportRecord: toTalkImportRecordMock,
  guessImageFilename: guessImageFilenameMock,
  fetchRemoteImagesForImport: fetchRemoteImagesForImportMock,
  EmlImportError: EmlImportErrorMock,
  MAX_EML_FILE_SIZE: 10 * 1024 * 1024,
  MAX_EML_FILE_COUNT: 200,
  MAX_EML_TOTAL_SIZE: 50 * 1024 * 1024,
}));

vi.mock("@/usecases/recordUseCases", () => ({
  attachRecordMedia: attachRecordMediaMock,
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
    const parseResult = {
      records,
      defaultYear: 2026,
      rowErrors,
      totalCount: 2,
    };
    parseTalkImportJsonMock.mockReturnValue(parseResult);
    const preview = {
      totalCount: 2,
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
      parseResult,
    );
    expect(result).toEqual({ preview: { ...preview, rowErrors } });
  });

  it("returns an error when jsonText exceeds MAX_IMPORT_FILE_SIZE", async () => {
    mockSupabaseClient({ id: "user-1" });
    const oversizedText = "a".repeat(5 * 1024 * 1024 + 1);

    const { previewTalkImportAction } = await import("./actions");
    const result = await previewTalkImportAction("conv-1", oversizedText);

    expect(result).toEqual({ error: "ファイルサイズは5MB以内にしてください" });
    expect(parseTalkImportJsonMock).not.toHaveBeenCalled();
  });

  it("measures the file size in UTF-8 bytes for multibyte JSON text", async () => {
    mockSupabaseClient({ id: "user-1" });
    const oversizedText = "あ".repeat(Math.floor((5 * 1024 * 1024) / 3) + 1);

    expect(oversizedText.length).toBeLessThan(5 * 1024 * 1024);
    expect(new TextEncoder().encode(oversizedText).byteLength).toBeGreaterThan(
      5 * 1024 * 1024,
    );

    const { previewTalkImportAction } = await import("./actions");
    const result = await previewTalkImportAction("conv-1", oversizedText);

    expect(result).toEqual({ error: "ファイルサイズは5MB以内にしてください" });
    expect(parseTalkImportJsonMock).not.toHaveBeenCalled();
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

  it("returns an error when jsonText exceeds MAX_IMPORT_FILE_SIZE", async () => {
    mockSupabaseClient({ id: "user-1" });
    const oversizedText = "a".repeat(5 * 1024 * 1024 + 1);

    const { executeTalkImportAction } = await import("./actions");
    const result = await executeTalkImportAction("conv-1", oversizedText, "{}");

    expect(result).toEqual({ error: "ファイルサイズは5MB以内にしてください" });
    expect(parseTalkImportJsonMock).not.toHaveBeenCalled();
    expect(executeImportMock).not.toHaveBeenCalled();
  });
});

// --- .eml インポート（#115） ---

/**
 * 実体の parseEmlFile/toTalkImportRecord を通す結合テスト用（#128 第3ラウンドレビュー対応
 * P1）に、text/plain 本文へ生の NUL 文字を1件埋め込んだ最小構成の .eml を組み立てる
 */
function buildRawEmlWithNulBody(): string {
  const nul = String.fromCharCode(0);
  const textBody = `前${nul}後`;
  return [
    'From: "Sender" <sender@example.com>',
    "To: recipient@example.com",
    "Subject: Test",
    "Date: Mon, 12 Oct 2020 06:16:14 +0000",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(textBody, "utf-8").toString("base64"),
    "",
  ].join("\r\n");
}

function buildFormDataWithFiles(
  files: { name: string; size?: number }[],
): FormData {
  const formData = new FormData();
  for (const { name, size } of files) {
    const content = size !== undefined ? new Uint8Array(size) : "eml content";
    formData.append("files", new File([content], name));
  }
  return formData;
}

/**
 * File の size を Object.defineProperty で偽装する（実データは確保しない）。
 * 合計サイズ上限（50MB）のテストで大きな ArrayBuffer を確保しないための helper（#128）
 */
function buildFormDataWithFakeSizes(
  files: { name: string; size: number }[],
): FormData {
  const formData = new FormData();
  for (const { name, size } of files) {
    const file = new File(["eml content"], name);
    Object.defineProperty(file, "size", { value: size });
    formData.append("files", file);
  }
  return formData;
}

function parsedMessage(
  overrides: Partial<{
    senderAddress: string;
    postedAt: string;
    title: string | null;
    content: string | null;
    image: { filename: string; mimeType: string; data: Uint8Array } | null;
    remoteImageUrl: string | null;
    extraImageCount: number;
  }> = {},
) {
  return {
    senderAddress: "sender@example.com",
    postedAt: "2020-10-12T06:16:14.000Z",
    title: "件名",
    content: "本文",
    image: null,
    remoteImageUrl: null,
    extraImageCount: 0,
    ...overrides,
  };
}

const VALID_PARTICIPANT_ID = "11111111-1111-1111-1111-111111111111";

describe("previewEmlImportAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);

    const { previewEmlImportAction } = await import("./actions");
    await expect(
      previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns an error when no files are provided", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = new FormData();

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    expect(result).toEqual({ error: "ファイルを選択してください" });
    expect(parseEmlFileMock).not.toHaveBeenCalled();
  });

  it("returns an error when the number of files exceeds MAX_EML_FILE_COUNT", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles(
      Array.from({ length: 201 }, (_, i) => ({ name: `${i}.eml` })),
    );

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    expect(result).toEqual({
      error: "一度にインポートできるのは200件までです。ファイルを分割してください",
    });
    expect(parseEmlFileMock).not.toHaveBeenCalled();
  });

  it("returns an error when the total size of files exceeds MAX_EML_TOTAL_SIZE, even if each file is within MAX_EML_FILE_SIZE", async () => {
    mockSupabaseClient({ id: "user-1" });
    // 各9MB(<=10MB) x 6件 = 54MB > 50MB
    const formData = buildFormDataWithFakeSizes(
      Array.from({ length: 6 }, (_, i) => ({
        name: `${i}.eml`,
        size: 9 * 1024 * 1024,
      })),
    );

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    expect(result).toEqual({
      error:
        "ファイルの合計サイズは50MB以内にしてください。ファイルを分割してください",
    });
    expect(parseEmlFileMock).not.toHaveBeenCalled();
  });

  it("accepts files whose total size is exactly MAX_EML_TOTAL_SIZE (boundary)", async () => {
    mockSupabaseClient({ id: "user-1" });
    // 各10MB x 5件 = ちょうど50MB
    const formData = buildFormDataWithFakeSizes(
      Array.from({ length: 5 }, (_, i) => ({
        name: `${i}.eml`,
        size: 10 * 1024 * 1024,
      })),
    );
    parseEmlFileMock.mockResolvedValue(parsedMessage());
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    buildImportPreviewMock.mockResolvedValue({
      totalCount: 5,
      importableCount: 5,
      duplicateCount: 0,
      period: null,
      typeCounts: { text: 5, image: 0, video: 0, audio: 0 },
      unknownSpeakers: [],
    });

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    expect(parseEmlFileMock).toHaveBeenCalledTimes(5);
    expect("error" in result).toBe(false);
  });

  it("treats an oversized file as a row error and still processes the others", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([
      { name: "big.eml", size: 10 * 1024 * 1024 + 1 },
      { name: "ok.eml" },
    ]);
    parseEmlFileMock.mockResolvedValue(parsedMessage());
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    buildImportPreviewMock.mockResolvedValue({
      totalCount: 2,
      importableCount: 1,
      duplicateCount: 0,
      period: null,
      typeCounts: { text: 1, image: 0, video: 0, audio: 0 },
      unknownSpeakers: [],
    });

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    expect(parseEmlFileMock).toHaveBeenCalledTimes(1);
    expect(parseEmlFileMock).toHaveBeenCalledWith(expect.anything(), "ok.eml");
    if ("error" in result) {
      throw new Error("expected a preview result");
    }
    expect(result.preview.rowErrors).toEqual([
      "big.eml: ファイルサイズは10MB以内にしてください",
    ]);
  });

  it("collects EmlImportError messages as row errors and still builds a preview from the rest", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([
      { name: "broken.eml" },
      { name: "ok.eml" },
    ]);
    parseEmlFileMock.mockImplementation(async (_raw: unknown, filename: string) => {
      if (filename === "broken.eml") {
        throw new EmlImportErrorMock(
          `${filename}: 差出人のメールアドレスを取得できませんでした`,
        );
      }
      return parsedMessage();
    });
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    buildImportPreviewMock.mockResolvedValue({
      totalCount: 2,
      importableCount: 1,
      duplicateCount: 0,
      period: null,
      typeCounts: { text: 1, image: 0, video: 0, audio: 0 },
      unknownSpeakers: [],
    });

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    if ("error" in result) {
      throw new Error("expected a preview result");
    }
    expect(result.preview.rowErrors).toEqual([
      "broken.eml: 差出人のメールアドレスを取得できませんでした",
    ]);
    expect(buildImportPreviewMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
      expect.objectContaining({ totalCount: 2 }),
      { speakerAssignments: { "sender@example.com": VALID_PARTICIPANT_ID } },
    );
  });

  it("summarizes senders, imageCount, and extraImageWarnings from the parsed messages", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([
      { name: "a.eml" },
      { name: "b.eml" },
      { name: "c.eml" },
    ]);
    parseEmlFileMock.mockImplementation(async (_raw: unknown, filename: string) => {
      if (filename === "a.eml") {
        return parsedMessage({
          senderAddress: "alice@example.com",
          image: { filename: "photo.png", mimeType: "image/png", data: new Uint8Array() },
          extraImageCount: 2,
        });
      }
      if (filename === "b.eml") {
        return parsedMessage({
          senderAddress: "alice@example.com",
        });
      }
      return parsedMessage({
        senderAddress: "bob@example.com",
      });
    });
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    buildImportPreviewMock.mockResolvedValue({
      totalCount: 3,
      importableCount: 3,
      duplicateCount: 0,
      period: null,
      typeCounts: { text: 2, image: 1, video: 0, audio: 0 },
      unknownSpeakers: [],
    });

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    if ("error" in result) {
      throw new Error("expected a preview result");
    }
    expect(result.preview.senders).toEqual(
      expect.arrayContaining([
        { address: "alice@example.com", messageCount: 2 },
        { address: "bob@example.com", messageCount: 1 },
      ]),
    );
    expect(result.preview.imageCount).toBe(1);
    expect(result.preview.extraImageWarnings).toEqual([
      "a.eml: 2枚目以降の画像 2枚は取り込まれません",
    ]);
  });

  // #129: 実メールは添付ファイルを持たず、画像は HTML 内のリモート参照のみのため、
  // 添付が無くリモート画像だけを持つメッセージも imageCount に含める
  it("counts messages that have only a remoteImageUrl (no attachment image) toward imageCount", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([
      { name: "a.eml" },
      { name: "b.eml" },
    ]);
    parseEmlFileMock.mockImplementation(async (_raw: unknown, filename: string) =>
      filename === "a.eml"
        ? parsedMessage({ remoteImageUrl: "https://example.com/1.jpg" })
        : parsedMessage(),
    );
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    buildImportPreviewMock.mockResolvedValue({
      totalCount: 2,
      importableCount: 2,
      duplicateCount: 0,
      period: null,
      typeCounts: { text: 1, image: 1, video: 0, audio: 0 },
      unknownSpeakers: [],
    });

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    if ("error" in result) {
      throw new Error("expected a preview result");
    }
    expect(result.preview.imageCount).toBe(1);
  });

  it("returns a generic error for unexpected failures", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);
    parseEmlFileMock.mockResolvedValue(parsedMessage());
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    buildImportPreviewMock.mockRejectedValue(new Error("boom"));

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    expect(result).toEqual({
      error:
        "メールファイルの解析に失敗しました。時間をおいて再度お試しください。",
    });
  });

  // #128 レビュー対応（P1）: プレビューと実行の重複排除を一致させるため、
  // previewEmlImportAction にも割り当て先 participantId を渡し、同じ検証を行う
  it("returns an error when participantId is empty", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction("conv-1", formData, "");

    expect(result).toEqual({ error: "参加者の割り当てが不正です" });
    expect(buildImportPreviewMock).not.toHaveBeenCalled();
  });

  it("returns an error when participantId is not a valid UUID", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction(
      "conv-1",
      formData,
      "not-a-uuid",
    );

    expect(result).toEqual({ error: "参加者の割り当てが不正です" });
    expect(buildImportPreviewMock).not.toHaveBeenCalled();
  });

  it("builds speakerAssignments mapping every distinct senderAddress to participantId and passes it to buildImportPreview, so the preview's duplicate detection matches what executeEmlImportAction will do (#128)", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([
      { name: "a.eml" },
      { name: "b.eml" },
    ]);
    parseEmlFileMock.mockImplementation(async (_raw: unknown, filename: string) =>
      filename === "a.eml"
        ? parsedMessage({ senderAddress: "alice@example.com" })
        : parsedMessage({ senderAddress: "bob@example.com" }),
    );
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    buildImportPreviewMock.mockResolvedValue({
      totalCount: 2,
      importableCount: 2,
      duplicateCount: 0,
      period: null,
      typeCounts: { text: 2, image: 0, video: 0, audio: 0 },
      unknownSpeakers: [],
    });

    const { previewEmlImportAction } = await import("./actions");
    await previewEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID);

    expect(buildImportPreviewMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
      expect.anything(),
      {
        speakerAssignments: {
          "alice@example.com": VALID_PARTICIPANT_ID,
          "bob@example.com": VALID_PARTICIPANT_ID,
        },
      },
    );
  });

  // #128 レビュー対応（P2/防御二重化）: 1通の本文解析エラー（parseEmlFile が
  // EmlImportError に変換した「本文の解析に失敗しました」）が、正常な他のメールの
  // プレビュー生成を止めないことを action 層でも確認する
  it("continues building the preview from the remaining messages when one .eml fails body normalization (mixed batch, #128)", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([
      { name: "broken-body.eml" },
      { name: "ok.eml" },
    ]);
    parseEmlFileMock.mockImplementation(async (_raw: unknown, filename: string) => {
      if (filename === "broken-body.eml") {
        throw new EmlImportErrorMock(
          `${filename}: 本文の解析に失敗しました`,
        );
      }
      return parsedMessage({ senderAddress: "ok@example.com" });
    });
    toTalkImportRecordMock.mockReturnValue({
      speaker: "ok@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    buildImportPreviewMock.mockResolvedValue({
      totalCount: 2,
      importableCount: 1,
      duplicateCount: 0,
      period: null,
      typeCounts: { text: 1, image: 0, video: 0, audio: 0 },
      unknownSpeakers: [],
    });

    const { previewEmlImportAction } = await import("./actions");
    const result = await previewEmlImportAction(
      "conv-1",
      formData,
      VALID_PARTICIPANT_ID,
    );

    if ("error" in result) {
      throw new Error("expected a preview result");
    }
    expect(result.preview.rowErrors).toEqual([
      "broken-body.eml: 本文の解析に失敗しました",
    ]);
    expect(result.preview.importableCount).toBe(1);
    expect(buildImportPreviewMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
      expect.objectContaining({ totalCount: 2 }),
      { speakerAssignments: { "ok@example.com": VALID_PARTICIPANT_ID } },
    );
  });
});

describe("executeEmlImportAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);

    const { executeEmlImportAction } = await import("./actions");
    await expect(
      executeEmlImportAction("conv-1", formData, VALID_PARTICIPANT_ID),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns an error when no files are provided", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = new FormData();

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction(
      "conv-1",
      formData,
      VALID_PARTICIPANT_ID,
    );

    expect(result).toEqual({ error: "ファイルを選択してください" });
    expect(executeImportMock).not.toHaveBeenCalled();
  });

  it("returns an error when participantId is empty", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);
    parseEmlFileMock.mockResolvedValue(parsedMessage());
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction("conv-1", formData, "");

    expect(result).toEqual({ error: "参加者の割り当てが不正です" });
    expect(executeImportMock).not.toHaveBeenCalled();
  });

  it("returns an error when participantId is not a valid UUID", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);
    parseEmlFileMock.mockResolvedValue(parsedMessage());
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction(
      "conv-1",
      formData,
      "not-a-uuid",
    );

    expect(result).toEqual({ error: "参加者の割り当てが不正です" });
    expect(executeImportMock).not.toHaveBeenCalled();
  });

  it("executes the import and attaches images to their created records via createdRecords", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([
      { name: "with-image.eml" },
      { name: "text-only.eml" },
    ]);

    const imageMessage = parsedMessage({
      senderAddress: "alice@example.com",
      image: { filename: "photo.png", mimeType: "image/png", data: new Uint8Array([1, 2, 3]) },
    });
    const textMessage = parsedMessage({ senderAddress: "bob@example.com" });

    parseEmlFileMock.mockImplementation(async (_raw: unknown, filename: string) =>
      filename === "with-image.eml" ? imageMessage : textMessage,
    );

    const imageRecord = {
      speaker: "alice@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "image" as const,
      title: "件名",
      content: "本文",
      hasAudio: false,
    };
    const textRecord = {
      speaker: "bob@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text" as const,
      title: "件名",
      content: "本文",
      hasAudio: false,
    };
    toTalkImportRecordMock.mockImplementation((message: { senderAddress: string }) =>
      message.senderAddress === "alice@example.com" ? imageRecord : textRecord,
    );

    executeImportMock.mockResolvedValue({
      createdCount: 2,
      skippedCount: 0,
      createdParticipants: {},
      createdRecords: [
        { record: imageRecord, id: "record-image" },
        { record: textRecord, id: "record-text" },
      ],
    });
    attachRecordMediaMock.mockResolvedValue({});

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction(
      "conv-1",
      formData,
      VALID_PARTICIPANT_ID,
    );

    expect(executeImportMock).toHaveBeenCalledWith(expect.anything(), "conv-1", {
      records: [imageRecord, textRecord],
      speakerAssignments: {
        "alice@example.com": VALID_PARTICIPANT_ID,
        "bob@example.com": VALID_PARTICIPANT_ID,
      },
    });
    expect(attachRecordMediaMock).toHaveBeenCalledTimes(1);
    expect(attachRecordMediaMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        recordId: "record-image",
        filename: "photo.png",
        contentType: "image/png",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
    if ("error" in result) {
      throw new Error("expected a result");
    }
    expect(result.result.attachedCount).toBe(1);
    expect(result.result.attachFailedCount).toBe(0);
    expect(result.result.createdCount).toBe(2);
  });

  it("counts attachFailedCount without aborting other attachments when attachRecordMedia throws", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([{ name: "with-image.eml" }]);
    const imageMessage = parsedMessage({
      image: { filename: "photo.png", mimeType: "image/png", data: new Uint8Array([1, 2, 3]) },
    });
    parseEmlFileMock.mockResolvedValue(imageMessage);
    const imageRecord = {
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "image" as const,
      title: "件名",
      content: "本文",
      hasAudio: false,
    };
    toTalkImportRecordMock.mockReturnValue(imageRecord);
    executeImportMock.mockResolvedValue({
      createdCount: 1,
      skippedCount: 0,
      createdParticipants: {},
      createdRecords: [{ record: imageRecord, id: "record-image" }],
    });
    attachRecordMediaMock.mockRejectedValue(new Error("storage down"));

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction(
      "conv-1",
      formData,
      VALID_PARTICIPANT_ID,
    );

    if ("error" in result) {
      throw new Error("expected a result");
    }
    expect(result.result.attachedCount).toBe(0);
    expect(result.result.attachFailedCount).toBe(1);
    expect(result.result.createdCount).toBe(1);
  });

  // #129: 実メールは添付ファイルを持たず画像は HTML 内のリモート参照のみのため、
  // 添付が無い場合は UseCase 層の fetchRemoteImagesForImport で一括取得してから添付する。
  // 取得そのもの（許可 URL の検証・サイズ上限・並列制御）は usecase/repository のテストで
  // 検証済みなので、ここでは action 層のオーケストレーション（タスクの組み立て・結果の
  // 添付・失敗集計）のみを検証する
  describe("remote image attachment via fetchRemoteImagesForImport (#129)", () => {
    const REMOTE_IMAGE_URL =
      "https://mail-web.c-nogizaka46.com/mail/output/qimage?image_name=abc123";

    beforeEach(() => {
      // action 層が fetch を直接呼ばないことの検証を兼ねた安全網
      // （誤って直接 fetch する実装に戻ると即座に失敗する）
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(
          new Error("action layer must not call fetch directly"),
        ),
      );
    });

    it("collects tasks only from messages without an attachment image, fetches them in one batch, and attaches the results", async () => {
      mockSupabaseClient({ id: "user-1" });
      const formData = buildFormDataWithFiles([
        { name: "remote-image.eml" },
        { name: "with-attachment.eml" },
      ]);
      const remoteMessage = parsedMessage({
        senderAddress: "alice@example.com",
        remoteImageUrl: REMOTE_IMAGE_URL,
      });
      const attachmentMessage = parsedMessage({
        senderAddress: "bob@example.com",
        image: {
          filename: "photo.png",
          mimeType: "image/png",
          data: new Uint8Array([1, 2, 3]),
        },
      });
      parseEmlFileMock.mockImplementation(
        async (_raw: unknown, filename: string) =>
          filename === "remote-image.eml" ? remoteMessage : attachmentMessage,
      );
      const remoteRecord = {
        speaker: "alice@example.com",
        postedAt: "2020-10-12T06:16:14.000Z",
        type: "image" as const,
        title: "件名",
        content: null,
        hasAudio: false,
      };
      const attachmentRecord = {
        speaker: "bob@example.com",
        postedAt: "2020-10-12T06:16:14.000Z",
        type: "image" as const,
        title: "件名",
        content: null,
        hasAudio: false,
      };
      toTalkImportRecordMock.mockImplementation(
        (message: { senderAddress: string }) =>
          message.senderAddress === "alice@example.com"
            ? remoteRecord
            : attachmentRecord,
      );
      executeImportMock.mockResolvedValue({
        createdCount: 2,
        skippedCount: 0,
        createdParticipants: {},
        createdRecords: [
          { record: remoteRecord, id: "record-remote" },
          { record: attachmentRecord, id: "record-attachment" },
        ],
      });
      fetchRemoteImagesForImportMock.mockResolvedValue(
        new Map([
          [
            "record-remote",
            {
              data: new Uint8Array([9, 8, 7]),
              contentType: "image/jpeg",
              filename: "image-1.jpeg",
            },
          ],
        ]),
      );
      attachRecordMediaMock.mockResolvedValue({});

      const { executeEmlImportAction } = await import("./actions");
      const result = await executeEmlImportAction(
        "conv-1",
        formData,
        VALID_PARTICIPANT_ID,
      );

      // 添付画像を持つメッセージはリモート取得タスクに含めない
      expect(fetchRemoteImagesForImportMock).toHaveBeenCalledTimes(1);
      expect(fetchRemoteImagesForImportMock).toHaveBeenCalledWith([
        { key: "record-remote", url: REMOTE_IMAGE_URL },
      ]);
      expect(attachRecordMediaMock).toHaveBeenCalledTimes(2);
      expect(attachRecordMediaMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "user-1",
          recordId: "record-remote",
          filename: "image-1.jpeg",
          contentType: "image/jpeg",
        }),
      );
      expect(attachRecordMediaMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          recordId: "record-attachment",
          filename: "photo.png",
        }),
      );
      const remoteAttachCall = attachRecordMediaMock.mock.calls.find(
        (call) =>
          (call[1] as { recordId: string }).recordId === "record-remote",
      ) as [unknown, { file: unknown }];
      expect(remoteAttachCall[1].file).toBeInstanceOf(Blob);
      if ("error" in result) {
        throw new Error("expected a result");
      }
      expect(result.result.attachedCount).toBe(2);
      expect(result.result.attachFailedCount).toBe(0);
    });

    it("counts attachFailedCount when the batch result for a record is null and continues with other attachments", async () => {
      mockSupabaseClient({ id: "user-1" });
      const formData = buildFormDataWithFiles([
        { name: "remote-image.eml" },
        { name: "with-attachment.eml" },
      ]);
      const remoteMessage = parsedMessage({
        senderAddress: "alice@example.com",
        remoteImageUrl: REMOTE_IMAGE_URL,
      });
      const attachmentMessage = parsedMessage({
        senderAddress: "bob@example.com",
        image: {
          filename: "photo.png",
          mimeType: "image/png",
          data: new Uint8Array([1, 2, 3]),
        },
      });
      parseEmlFileMock.mockImplementation(
        async (_raw: unknown, filename: string) =>
          filename === "remote-image.eml" ? remoteMessage : attachmentMessage,
      );
      const remoteRecord = {
        speaker: "alice@example.com",
        postedAt: "2020-10-12T06:16:14.000Z",
        type: "image" as const,
        title: "件名",
        content: null,
        hasAudio: false,
      };
      const attachmentRecord = {
        speaker: "bob@example.com",
        postedAt: "2020-10-12T06:16:14.000Z",
        type: "image" as const,
        title: "件名",
        content: null,
        hasAudio: false,
      };
      toTalkImportRecordMock.mockImplementation(
        (message: { senderAddress: string }) =>
          message.senderAddress === "alice@example.com"
            ? remoteRecord
            : attachmentRecord,
      );
      executeImportMock.mockResolvedValue({
        createdCount: 2,
        skippedCount: 0,
        createdParticipants: {},
        createdRecords: [
          { record: remoteRecord, id: "record-remote" },
          { record: attachmentRecord, id: "record-attachment" },
        ],
      });
      fetchRemoteImagesForImportMock.mockResolvedValue(
        new Map([["record-remote", null]]),
      );
      attachRecordMediaMock.mockResolvedValue({});
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { executeEmlImportAction } = await import("./actions");
      const result = await executeEmlImportAction(
        "conv-1",
        formData,
        VALID_PARTICIPANT_ID,
      );

      // リモート画像の取得失敗は当該レコードのみ失敗扱いにし、添付画像側は続行する
      expect(attachRecordMediaMock).toHaveBeenCalledTimes(1);
      expect(attachRecordMediaMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recordId: "record-attachment" }),
      );
      if ("error" in result) {
        throw new Error("expected a result");
      }
      expect(result.result.attachedCount).toBe(1);
      expect(result.result.attachFailedCount).toBe(1);
    });

    it("treats a record missing from the batch result as an attach failure", async () => {
      mockSupabaseClient({ id: "user-1" });
      const formData = buildFormDataWithFiles([{ name: "remote-image.eml" }]);
      const remoteMessage = parsedMessage({
        remoteImageUrl: REMOTE_IMAGE_URL,
      });
      parseEmlFileMock.mockResolvedValue(remoteMessage);
      const remoteRecord = {
        speaker: "sender@example.com",
        postedAt: "2020-10-12T06:16:14.000Z",
        type: "image" as const,
        title: "件名",
        content: null,
        hasAudio: false,
      };
      toTalkImportRecordMock.mockReturnValue(remoteRecord);
      executeImportMock.mockResolvedValue({
        createdCount: 1,
        skippedCount: 0,
        createdParticipants: {},
        createdRecords: [{ record: remoteRecord, id: "record-remote" }],
      });
      fetchRemoteImagesForImportMock.mockResolvedValue(new Map());
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { executeEmlImportAction } = await import("./actions");
      const result = await executeEmlImportAction(
        "conv-1",
        formData,
        VALID_PARTICIPANT_ID,
      );

      expect(attachRecordMediaMock).not.toHaveBeenCalled();
      if ("error" in result) {
        throw new Error("expected a result");
      }
      expect(result.result.attachedCount).toBe(0);
      expect(result.result.attachFailedCount).toBe(1);
    });

    it("counts attachFailedCount when attaching a fetched remote image throws, without aborting other records", async () => {
      mockSupabaseClient({ id: "user-1" });
      const formData = buildFormDataWithFiles([{ name: "remote-image.eml" }]);
      const remoteMessage = parsedMessage({
        remoteImageUrl: REMOTE_IMAGE_URL,
      });
      parseEmlFileMock.mockResolvedValue(remoteMessage);
      const remoteRecord = {
        speaker: "sender@example.com",
        postedAt: "2020-10-12T06:16:14.000Z",
        type: "image" as const,
        title: "件名",
        content: null,
        hasAudio: false,
      };
      toTalkImportRecordMock.mockReturnValue(remoteRecord);
      executeImportMock.mockResolvedValue({
        createdCount: 1,
        skippedCount: 0,
        createdParticipants: {},
        createdRecords: [{ record: remoteRecord, id: "record-remote" }],
      });
      fetchRemoteImagesForImportMock.mockResolvedValue(
        new Map([
          [
            "record-remote",
            {
              data: new Uint8Array([1]),
              contentType: "image/png",
              filename: "image-1.png",
            },
          ],
        ]),
      );
      attachRecordMediaMock.mockRejectedValue(new Error("storage down"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { executeEmlImportAction } = await import("./actions");
      const result = await executeEmlImportAction(
        "conv-1",
        formData,
        VALID_PARTICIPANT_ID,
      );

      if ("error" in result) {
        throw new Error("expected a result");
      }
      expect(result.result.attachedCount).toBe(0);
      expect(result.result.attachFailedCount).toBe(1);
    });
  });

  it("passes through the ImportError message", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);
    parseEmlFileMock.mockResolvedValue(parsedMessage());
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    executeImportMock.mockRejectedValue(
      new ImportErrorMock("発言者「sender@example.com」の割り当てを指定してください"),
    );

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction(
      "conv-1",
      formData,
      VALID_PARTICIPANT_ID,
    );

    expect(result).toEqual({
      error: "発言者「sender@example.com」の割り当てを指定してください",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns a generic error for unexpected failures", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([{ name: "a.eml" }]);
    parseEmlFileMock.mockResolvedValue(parsedMessage());
    toTalkImportRecordMock.mockReturnValue({
      speaker: "sender@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text",
      title: "件名",
      content: "本文",
      hasAudio: false,
    });
    executeImportMock.mockRejectedValue(new Error("boom"));

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction(
      "conv-1",
      formData,
      VALID_PARTICIPANT_ID,
    );

    expect(result).toEqual({
      error: "インポートに失敗しました。時間をおいて再度お試しください。",
    });
  });

  it("maps every distinct senderAddress found in the parsed messages to the given participantId (#128 簡素化: From は取り違え防止の警告用途のみ)", async () => {
    mockSupabaseClient({ id: "user-1" });
    const formData = buildFormDataWithFiles([
      { name: "a.eml" },
      { name: "b.eml" },
    ]);
    parseEmlFileMock.mockImplementation(async (_raw: unknown, filename: string) =>
      filename === "a.eml"
        ? parsedMessage({ senderAddress: "alice@example.com" })
        : parsedMessage({ senderAddress: "bob@example.com" }),
    );
    const aliceRecord = {
      speaker: "alice@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text" as const,
      title: "件名",
      content: "本文",
      hasAudio: false,
    };
    const bobRecord = {
      speaker: "bob@example.com",
      postedAt: "2020-10-12T06:16:14.000Z",
      type: "text" as const,
      title: "件名",
      content: "本文",
      hasAudio: false,
    };
    toTalkImportRecordMock.mockImplementation((message: { senderAddress: string }) =>
      message.senderAddress === "alice@example.com" ? aliceRecord : bobRecord,
    );
    executeImportMock.mockResolvedValue({
      createdCount: 2,
      skippedCount: 0,
      createdParticipants: {},
      createdRecords: [],
    });

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction(
      "conv-1",
      formData,
      VALID_PARTICIPANT_ID,
    );

    expect(executeImportMock).toHaveBeenCalledWith(expect.anything(), "conv-1", {
      records: [aliceRecord, bobRecord],
      speakerAssignments: {
        "alice@example.com": VALID_PARTICIPANT_ID,
        "bob@example.com": VALID_PARTICIPANT_ID,
      },
    });
    if ("error" in result) {
      throw new Error("expected a result");
    }
    expect(result.result.createdCount).toBe(2);
  });

  // #128 第3ラウンドレビュー対応（P1）: parseEmlFile/toTalkImportRecord のモックを実体に
  // 差し替え、NUL を含む .eml を実際にパースさせた上で、executeImport に渡る records の
  // content から U+0000 が除去されていることを確認する（usecase 単体テストだけでなく、
  // action 層での結合まで通しで検証する）
  it("strips NUL characters through the real parseEmlFile/toTalkImportRecord pipeline before calling executeImport", async () => {
    mockSupabaseClient({ id: "user-1" });

    const actualEmlImportUseCases = await vi.importActual<
      typeof import("@/usecases/emlImportUseCases")
    >("@/usecases/emlImportUseCases");
    parseEmlFileMock.mockImplementation(actualEmlImportUseCases.parseEmlFile);
    toTalkImportRecordMock.mockImplementation(
      actualEmlImportUseCases.toTalkImportRecord,
    );

    const formData = new FormData();
    formData.append("files", new File([buildRawEmlWithNulBody()], "nul.eml"));

    executeImportMock.mockResolvedValue({
      createdCount: 1,
      skippedCount: 0,
      createdParticipants: {},
      createdRecords: [],
    });

    const { executeEmlImportAction } = await import("./actions");
    const result = await executeEmlImportAction(
      "conv-1",
      formData,
      VALID_PARTICIPANT_ID,
    );

    expect(executeImportMock).toHaveBeenCalledWith(expect.anything(), "conv-1", {
      records: [
        {
          speaker: "sender@example.com",
          postedAt: "2020-10-12T06:16:14.000Z",
          type: "text",
          title: "Test",
          content: "前後",
          hasAudio: false,
        },
      ],
      speakerAssignments: { "sender@example.com": VALID_PARTICIPANT_ID },
    });
    if ("error" in result) {
      throw new Error("expected a result");
    }
    expect(result.result.createdCount).toBe(1);
  });
});
