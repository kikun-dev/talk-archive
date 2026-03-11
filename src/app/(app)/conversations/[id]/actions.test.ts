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

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/usecases/recordUseCases", () => ({
  validateAddTextRecordInput: validateAddTextRecordInputMock,
  addTextRecord: addTextRecordMock,
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
