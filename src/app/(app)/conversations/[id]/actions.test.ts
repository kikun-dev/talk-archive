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
const validateAddTextRecordInputMock = vi.fn();
const addTextRecordMock = vi.fn();
const addImageRecordMock = vi.fn();
const validateAddMediaRecordInputMock = vi.fn();
const validateUpdateConversationInputMock = vi.fn();
const updateExistingConversationMock = vi.fn();
const deleteExistingConversationMock = vi.fn();
const validateUpdateRecordInputMock = vi.fn();
const updateExistingRecordMock = vi.fn();
const deleteExistingRecordMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/usecases/conversationUseCases", () => ({
  validateUpdateConversationInput: validateUpdateConversationInputMock,
  updateExistingConversation: updateExistingConversationMock,
  deleteExistingConversation: deleteExistingConversationMock,
}));

vi.mock("@/usecases/recordUseCases", () => ({
  validateAddTextRecordInput: validateAddTextRecordInputMock,
  addTextRecord: addTextRecordMock,
  addImageRecord: addImageRecordMock,
  validateAddMediaRecordInput: validateAddMediaRecordInputMock,
  validateUpdateRecordInput: validateUpdateRecordInputMock,
  updateExistingRecord: updateExistingRecordMock,
  deleteExistingRecord: deleteExistingRecordMock,
}));

function mockSupabaseClient(user: { id: string } | null) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: { getUser: getUserMock },
  });
  getUserMock.mockResolvedValue({ data: { user } });
}

function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(data)) {
    formData.set(key, value);
  }

  return formData;
}

function createFormDataWithFile(
  fieldName: string,
  filename: string = "invalid.txt",
): FormData {
  const formData = new FormData();
  formData.set(fieldName, new File(["dummy"], filename, { type: "text/plain" }));
  return formData;
}

describe("addTextRecordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { addTextRecordAction } = await import("./actions");
    await expect(
      addTextRecordAction(
        "conv-1",
        undefined,
        createFormData({ content: "テスト" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns error when validation fails", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddTextRecordInputMock.mockReturnValue(
      "テキストを入力してください",
    );

    const { addTextRecordAction } = await import("./actions");
    const result = await addTextRecordAction(
      "conv-1",
      undefined,
      createFormData({ content: "" }),
    );

    expect(result).toEqual({ error: "テキストを入力してください" });
    expect(addTextRecordMock).not.toHaveBeenCalled();
  });

  it("returns error when title is not a string", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addTextRecordAction } = await import("./actions");
    const formData = createFormData({ content: "テスト内容" });
    formData.set("title", new File(["dummy"], "title.txt", { type: "text/plain" }));

    const result = await addTextRecordAction("conv-1", undefined, formData);

    expect(result).toEqual({ error: "タイトルのデータが不正です" });
    expect(validateAddTextRecordInputMock).not.toHaveBeenCalled();
    expect(addTextRecordMock).not.toHaveBeenCalled();
  });

  it("returns error when content is missing", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addTextRecordAction } = await import("./actions");
    const result = await addTextRecordAction(
      "conv-1",
      undefined,
      createFormData({ title: "タイトル" }),
    );

    expect(result).toEqual({ error: "テキストのデータが不正です" });
    expect(validateAddTextRecordInputMock).not.toHaveBeenCalled();
    expect(addTextRecordMock).not.toHaveBeenCalled();
  });

  it("returns error when content is not a string", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addTextRecordAction } = await import("./actions");
    const result = await addTextRecordAction(
      "conv-1",
      undefined,
      createFormDataWithFile("content"),
    );

    expect(result).toEqual({ error: "テキストのデータが不正です" });
    expect(validateAddTextRecordInputMock).not.toHaveBeenCalled();
    expect(addTextRecordMock).not.toHaveBeenCalled();
  });

  it("adds record and revalidates on success", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddTextRecordInputMock.mockReturnValue(null);
    addTextRecordMock.mockResolvedValue({ id: "rec-new" });

    const { addTextRecordAction } = await import("./actions");
    const result = await addTextRecordAction(
      "conv-1",
      undefined,
      createFormData({ title: "タイトル", content: "テスト内容" }),
    );

    expect(result).toBeUndefined();
    expect(addTextRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId: "conv-1",
        title: "タイトル",
        content: "テスト内容",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });

  it("passes null title when title is empty", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddTextRecordInputMock.mockReturnValue(null);
    addTextRecordMock.mockResolvedValue({ id: "rec-new" });

    const { addTextRecordAction } = await import("./actions");
    await addTextRecordAction(
      "conv-1",
      undefined,
      createFormData({ title: "", content: "テスト" }),
    );

    expect(addTextRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: null,
      }),
    );
  });
});

const validConversationFormData = {
  title: "更新タイトル",
  idolGroup: "sakurazaka",
  activePeriods: JSON.stringify([{ startDate: "2026-01-01", endDate: null }]),
  participants: JSON.stringify([{ name: "メンバーA" }]),
};

describe("updateConversationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { updateConversationAction } = await import("./actions");
    await expect(
      updateConversationAction(
        "conv-1",
        undefined,
        createFormData(validConversationFormData),
      ),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns error when validation fails", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateUpdateConversationInputMock.mockReturnValue(
      "タイトルを入力してください",
    );

    const { updateConversationAction } = await import("./actions");
    const result = await updateConversationAction(
      "conv-1",
      undefined,
      createFormData({ ...validConversationFormData, title: "" }),
    );

    expect(result).toEqual({ error: "タイトルを入力してください" });
    expect(updateExistingConversationMock).not.toHaveBeenCalled();
  });

  it("returns error when activePeriods JSON is invalid", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { updateConversationAction } = await import("./actions");
    const result = await updateConversationAction(
      "conv-1",
      undefined,
      createFormData({ ...validConversationFormData, activePeriods: "bad" }),
    );

    expect(result).toEqual({ error: "会話期間のデータが不正です" });
  });

  it("returns error when participants JSON is invalid", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { updateConversationAction } = await import("./actions");
    const result = await updateConversationAction(
      "conv-1",
      undefined,
      createFormData({ ...validConversationFormData, participants: "bad" }),
    );

    expect(result).toEqual({ error: "参加者のデータが不正です" });
  });

  it("updates conversation and revalidates on success", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateUpdateConversationInputMock.mockReturnValue(null);
    updateExistingConversationMock.mockResolvedValue({ id: "conv-1" });

    const { updateConversationAction } = await import("./actions");
    const result = await updateConversationAction(
      "conv-1",
      undefined,
      createFormData(validConversationFormData),
    );

    expect(result).toBeUndefined();
    expect(updateExistingConversationMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
      expect.objectContaining({
        title: "更新タイトル",
        idolGroup: "sakurazaka",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });
});

describe("deleteConversationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { deleteConversationAction } = await import("./actions");
    await expect(
      deleteConversationAction("conv-1"),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("deletes conversation and redirects to home", async () => {
    mockSupabaseClient({ id: "user-1" });
    deleteExistingConversationMock.mockResolvedValue(undefined);

    const { deleteConversationAction } = await import("./actions");
    await expect(
      deleteConversationAction("conv-1"),
    ).rejects.toThrow("NEXT_REDIRECT: /");

    expect(deleteExistingConversationMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
    );
  });
});

describe("updateRecordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { updateRecordAction } = await import("./actions");
    await expect(
      updateRecordAction(
        "conv-1",
        "rec-1",
        undefined,
        createFormData({ content: "テスト" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns error when validation fails", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateUpdateRecordInputMock.mockReturnValue(
      "テキストを入力してください",
    );

    const { updateRecordAction } = await import("./actions");
    const result = await updateRecordAction(
      "conv-1",
      "rec-1",
      undefined,
      createFormData({ content: "" }),
    );

    expect(result).toEqual({ error: "テキストを入力してください" });
    expect(updateExistingRecordMock).not.toHaveBeenCalled();
  });

  it("updates record and revalidates on success", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateUpdateRecordInputMock.mockReturnValue(null);
    updateExistingRecordMock.mockResolvedValue({ id: "rec-1" });

    const { updateRecordAction } = await import("./actions");
    const result = await updateRecordAction(
      "conv-1",
      "rec-1",
      undefined,
      createFormData({ title: "新タイトル", content: "新内容" }),
    );

    expect(result).toBeUndefined();
    expect(updateExistingRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      "rec-1",
      expect.objectContaining({
        title: "新タイトル",
        content: "新内容",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });
});

describe("deleteRecordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { deleteRecordAction } = await import("./actions");
    await expect(
      deleteRecordAction("conv-1", "rec-1"),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("deletes record and revalidates", async () => {
    mockSupabaseClient({ id: "user-1" });
    deleteExistingRecordMock.mockResolvedValue(undefined);

    const { deleteRecordAction } = await import("./actions");
    await deleteRecordAction("conv-1", "rec-1");

    expect(deleteExistingRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      "rec-1",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });
});

function createImageFormData(overrides?: {
  file?: File;
  title?: string;
  content?: string;
}): FormData {
  const formData = new FormData();
  const file =
    overrides?.file ??
    new File(["image-data"], "photo.jpg", { type: "image/jpeg" });
  formData.set("file", file);
  if (overrides?.title !== undefined) {
    formData.set("title", overrides.title);
  }
  if (overrides?.content !== undefined) {
    formData.set("content", overrides.content);
  }
  return formData;
}

describe("addImageRecordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { addImageRecordAction } = await import("./actions");
    await expect(
      addImageRecordAction("conv-1", undefined, createImageFormData()),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns error when file is missing", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addImageRecordAction } = await import("./actions");
    const formData = new FormData();
    const result = await addImageRecordAction("conv-1", undefined, formData);

    expect(result).toEqual({ error: "画像ファイルを選択してください" });
    expect(addImageRecordMock).not.toHaveBeenCalled();
  });

  it("returns error when file is empty", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addImageRecordAction } = await import("./actions");
    const formData = new FormData();
    formData.set("file", new File([], "empty.jpg", { type: "image/jpeg" }));
    const result = await addImageRecordAction("conv-1", undefined, formData);

    expect(result).toEqual({ error: "画像ファイルを選択してください" });
  });

  it("returns error when file exceeds 10MB", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addImageRecordAction } = await import("./actions");
    const largeFile = new File(
      [new ArrayBuffer(10 * 1024 * 1024 + 1)],
      "large.jpg",
      { type: "image/jpeg" },
    );
    const result = await addImageRecordAction(
      "conv-1",
      undefined,
      createImageFormData({ file: largeFile }),
    );

    expect(result).toEqual({
      error: "ファイルサイズは10MB以内にしてください",
    });
  });

  it("returns error when file is not an image", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addImageRecordAction } = await import("./actions");
    const textFile = new File(["text"], "doc.txt", { type: "text/plain" });
    const result = await addImageRecordAction(
      "conv-1",
      undefined,
      createImageFormData({ file: textFile }),
    );

    expect(result).toEqual({ error: "画像ファイルを選択してください" });
  });

  it("returns error when title is not a string", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addImageRecordAction } = await import("./actions");
    const formData = createImageFormData();
    formData.set(
      "title",
      new File(["dummy"], "title.txt", { type: "text/plain" }),
    );

    const result = await addImageRecordAction("conv-1", undefined, formData);

    expect(result).toEqual({ error: "タイトルのデータが不正です" });
  });

  it("returns error when validation fails", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddMediaRecordInputMock.mockReturnValue(
      "タイトルは200文字以内で入力してください",
    );

    const { addImageRecordAction } = await import("./actions");
    const result = await addImageRecordAction(
      "conv-1",
      undefined,
      createImageFormData(),
    );

    expect(result).toEqual({
      error: "タイトルは200文字以内で入力してください",
    });
    expect(addImageRecordMock).not.toHaveBeenCalled();
  });

  it("uploads image and revalidates on success", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddMediaRecordInputMock.mockReturnValue(null);
    addImageRecordMock.mockResolvedValue({
      record: { id: "rec-1" },
      attachment: { id: "att-1" },
    });

    const { addImageRecordAction } = await import("./actions");
    const result = await addImageRecordAction(
      "conv-1",
      undefined,
      createImageFormData({ title: "写真タイトル", content: "説明文" }),
    );

    expect(result).toBeUndefined();
    expect(addImageRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        conversationId: "conv-1",
        title: "写真タイトル",
        content: "説明文",
        filename: "photo.jpg",
        contentType: "image/jpeg",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });

  it("passes null title and content when empty", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddMediaRecordInputMock.mockReturnValue(null);
    addImageRecordMock.mockResolvedValue({
      record: { id: "rec-1" },
      attachment: { id: "att-1" },
    });

    const { addImageRecordAction } = await import("./actions");
    await addImageRecordAction(
      "conv-1",
      undefined,
      createImageFormData({ title: "", content: "" }),
    );

    expect(addImageRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: null,
        content: null,
      }),
    );
  });
});
