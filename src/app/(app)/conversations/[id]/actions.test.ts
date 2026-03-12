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
const addVideoRecordMock = vi.fn();
const addAudioRecordMock = vi.fn();
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
  addVideoRecord: addVideoRecordMock,
  addAudioRecord: addAudioRecordMock,
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

const validTextFormData = {
  content: "テスト内容",
  speakerParticipantId: "part-1",
  postedAt: "2026-01-01T12:00:00Z",
};

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
        createFormData(validTextFormData),
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
      createFormData({ ...validTextFormData, content: "" }),
    );

    expect(result).toEqual({ error: "テキストを入力してください" });
    expect(addTextRecordMock).not.toHaveBeenCalled();
  });

  it("returns error when title is not a string", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addTextRecordAction } = await import("./actions");
    const formData = createFormData(validTextFormData);
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
      createFormData({
        title: "タイトル",
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00Z",
      }),
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

  it("returns error when speakerParticipantId is missing", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addTextRecordAction } = await import("./actions");
    const result = await addTextRecordAction(
      "conv-1",
      undefined,
      createFormData({ content: "テスト", postedAt: "2026-01-01T12:00:00Z" }),
    );

    expect(result).toEqual({ error: "発言者のデータが不正です" });
    expect(addTextRecordMock).not.toHaveBeenCalled();
  });

  it("returns error when postedAt is missing", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addTextRecordAction } = await import("./actions");
    const result = await addTextRecordAction(
      "conv-1",
      undefined,
      createFormData({ content: "テスト", speakerParticipantId: "part-1" }),
    );

    expect(result).toEqual({ error: "投稿日時のデータが不正です" });
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
      createFormData({
        ...validTextFormData,
        title: "タイトル",
      }),
    );

    expect(result).toBeUndefined();
    expect(addTextRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId: "conv-1",
        title: "タイトル",
        content: "テスト内容",
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00.000Z",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });

  it("converts datetime-local postedAt from JST before saving", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddTextRecordInputMock.mockReturnValue(null);
    addTextRecordMock.mockResolvedValue({ id: "rec-new" });

    const { addTextRecordAction } = await import("./actions");
    await addTextRecordAction(
      "conv-1",
      undefined,
      createFormData({
        content: "テスト内容",
        speakerParticipantId: "part-1",
        postedAt: "2026-02-28T15:53",
      }),
    );

    expect(addTextRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postedAt: "2026-02-28T06:53:00.000Z",
      }),
    );
  });

  it("passes null title when title is empty", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddTextRecordInputMock.mockReturnValue(null);
    addTextRecordMock.mockResolvedValue({ id: "rec-new" });

    const { addTextRecordAction } = await import("./actions");
    await addTextRecordAction(
      "conv-1",
      undefined,
      createFormData({ ...validTextFormData, title: "" }),
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
  speakerParticipantId?: string;
  postedAt?: string;
}): FormData {
  const formData = new FormData();
  const file =
    overrides?.file ??
    new File(["image-data"], "photo.jpg", { type: "image/jpeg" });
  formData.set("file", file);
  formData.set("speakerParticipantId", overrides?.speakerParticipantId ?? "part-1");
  formData.set("postedAt", overrides?.postedAt ?? "2026-01-01T12:00:00Z");
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
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00.000Z",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });

  it("converts datetime-local postedAt for image records", async () => {
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
      createImageFormData({ postedAt: "2026-02-28T15:53" }),
    );

    expect(addImageRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postedAt: "2026-02-28T06:53:00.000Z",
      }),
    );
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

function createVideoFormData(overrides?: {
  file?: File;
  title?: string;
  hasAudio?: string;
  speakerParticipantId?: string;
  postedAt?: string;
}): FormData {
  const formData = new FormData();
  const file =
    overrides?.file ??
    new File(["video-data"], "clip.mp4", { type: "video/mp4" });
  formData.set("file", file);
  formData.set("speakerParticipantId", overrides?.speakerParticipantId ?? "part-1");
  formData.set("postedAt", overrides?.postedAt ?? "2026-01-01T12:00:00Z");
  if (overrides?.title !== undefined) {
    formData.set("title", overrides.title);
  }
  if (overrides?.hasAudio !== undefined) {
    formData.set("hasAudio", overrides.hasAudio);
  }
  return formData;
}

describe("addVideoRecordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { addVideoRecordAction } = await import("./actions");
    await expect(
      addVideoRecordAction("conv-1", undefined, createVideoFormData()),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns error when file is missing", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addVideoRecordAction } = await import("./actions");
    const result = await addVideoRecordAction(
      "conv-1",
      undefined,
      new FormData(),
    );

    expect(result).toEqual({ error: "動画ファイルを選択してください" });
    expect(addVideoRecordMock).not.toHaveBeenCalled();
  });

  it("returns error when file exceeds 50MB", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addVideoRecordAction } = await import("./actions");
    const largeFile = new File(
      [new ArrayBuffer(50 * 1024 * 1024 + 1)],
      "large.mp4",
      { type: "video/mp4" },
    );
    const result = await addVideoRecordAction(
      "conv-1",
      undefined,
      createVideoFormData({ file: largeFile }),
    );

    expect(result).toEqual({
      error: "ファイルサイズは50MB以内にしてください",
    });
  });

  it("returns error when file is not a video", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addVideoRecordAction } = await import("./actions");
    const imageFile = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    const result = await addVideoRecordAction(
      "conv-1",
      undefined,
      createVideoFormData({ file: imageFile }),
    );

    expect(result).toEqual({ error: "動画ファイルを選択してください" });
  });

  it("uploads video with hasAudio true and revalidates on success", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddMediaRecordInputMock.mockReturnValue(null);
    addVideoRecordMock.mockResolvedValue({
      record: { id: "rec-1" },
      attachment: { id: "att-1" },
    });

    const { addVideoRecordAction } = await import("./actions");
    const result = await addVideoRecordAction(
      "conv-1",
      undefined,
      createVideoFormData({ title: "動画タイトル", hasAudio: "true" }),
    );

    expect(result).toBeUndefined();
    expect(addVideoRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        conversationId: "conv-1",
        title: "動画タイトル",
        filename: "clip.mp4",
        contentType: "video/mp4",
        hasAudio: true,
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00.000Z",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });

  it("sets hasAudio to false when checkbox is unchecked", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddMediaRecordInputMock.mockReturnValue(null);
    addVideoRecordMock.mockResolvedValue({
      record: { id: "rec-1" },
      attachment: { id: "att-1" },
    });

    const { addVideoRecordAction } = await import("./actions");
    await addVideoRecordAction(
      "conv-1",
      undefined,
      createVideoFormData(),
    );

    expect(addVideoRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hasAudio: false }),
    );
  });
});

function createAudioFormData(overrides?: {
  file?: File;
  title?: string;
  speakerParticipantId?: string;
  postedAt?: string;
}): FormData {
  const formData = new FormData();
  const file =
    overrides?.file ??
    new File(["audio-data"], "voice.mp3", { type: "audio/mpeg" });
  formData.set("file", file);
  formData.set("speakerParticipantId", overrides?.speakerParticipantId ?? "part-1");
  formData.set("postedAt", overrides?.postedAt ?? "2026-01-01T12:00:00Z");
  if (overrides?.title !== undefined) {
    formData.set("title", overrides.title);
  }
  return formData;
}

describe("addAudioRecordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { addAudioRecordAction } = await import("./actions");
    await expect(
      addAudioRecordAction("conv-1", undefined, createAudioFormData()),
    ).rejects.toThrow("NEXT_REDIRECT: /login");
  });

  it("returns error when file is missing", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addAudioRecordAction } = await import("./actions");
    const result = await addAudioRecordAction(
      "conv-1",
      undefined,
      new FormData(),
    );

    expect(result).toEqual({ error: "音声ファイルを選択してください" });
    expect(addAudioRecordMock).not.toHaveBeenCalled();
  });

  it("returns error when file exceeds 50MB", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addAudioRecordAction } = await import("./actions");
    const largeFile = new File(
      [new ArrayBuffer(50 * 1024 * 1024 + 1)],
      "large.mp3",
      { type: "audio/mpeg" },
    );
    const result = await addAudioRecordAction(
      "conv-1",
      undefined,
      createAudioFormData({ file: largeFile }),
    );

    expect(result).toEqual({
      error: "ファイルサイズは50MB以内にしてください",
    });
  });

  it("returns error when file is not audio", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { addAudioRecordAction } = await import("./actions");
    const imageFile = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    const result = await addAudioRecordAction(
      "conv-1",
      undefined,
      createAudioFormData({ file: imageFile }),
    );

    expect(result).toEqual({ error: "音声ファイルを選択してください" });
  });

  it("uploads audio and revalidates on success", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateAddMediaRecordInputMock.mockReturnValue(null);
    addAudioRecordMock.mockResolvedValue({
      record: { id: "rec-1" },
      attachment: { id: "att-1" },
    });

    const { addAudioRecordAction } = await import("./actions");
    const result = await addAudioRecordAction(
      "conv-1",
      undefined,
      createAudioFormData({ title: "音声タイトル" }),
    );

    expect(result).toBeUndefined();
    expect(addAudioRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        conversationId: "conv-1",
        title: "音声タイトル",
        content: null,
        filename: "voice.mp3",
        contentType: "audio/mpeg",
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00.000Z",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/conversations/conv-1");
  });
});
