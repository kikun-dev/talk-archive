import { describe, expect, it, vi, beforeEach } from "vitest";

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
const validateCreateConversationInputMock = vi.fn();
const createNewConversationMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/usecases/conversationUseCases", () => ({
  validateCreateConversationInput: validateCreateConversationInputMock,
  createNewConversation: createNewConversationMock,
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

const validFormData = {
  title: "テスト会話",
  idolGroup: "nogizaka",
  activePeriods: JSON.stringify([{ startDate: "2026-01-01", endDate: null }]),
  participants: JSON.stringify([{ name: "メンバーA" }]),
};

describe("createConversationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when not authenticated", async () => {
    mockSupabaseClient(null);

    const { createConversationAction } = await import("./actions");
    await expect(
      createConversationAction(undefined, createFormData(validFormData)),
    ).rejects.toThrow("NEXT_REDIRECT: /login");

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("returns error when activePeriods JSON is invalid", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { createConversationAction } = await import("./actions");
    const formData = createFormData({
      ...validFormData,
      activePeriods: "invalid-json",
    });
    const result = await createConversationAction(undefined, formData);

    expect(result).toEqual({ error: "会話期間のデータが不正です" });
  });

  it("returns error when validation fails", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateCreateConversationInputMock.mockReturnValue(
      "タイトルを入力してください",
    );

    const { createConversationAction } = await import("./actions");
    const formData = createFormData({ ...validFormData, title: "" });
    const result = await createConversationAction(undefined, formData);

    expect(result).toEqual({ error: "タイトルを入力してください" });
  });

  it("returns error when participants JSON is invalid", async () => {
    mockSupabaseClient({ id: "user-1" });

    const { createConversationAction } = await import("./actions");
    const formData = createFormData({
      ...validFormData,
      participants: "invalid-json",
    });
    const result = await createConversationAction(undefined, formData);

    expect(result).toEqual({ error: "参加者のデータが不正です" });
  });

  it("creates conversation and redirects on success", async () => {
    mockSupabaseClient({ id: "user-1" });
    validateCreateConversationInputMock.mockReturnValue(null);
    createNewConversationMock.mockResolvedValue({ id: "conv-new" });

    const { createConversationAction } = await import("./actions");
    await expect(
      createConversationAction(undefined, createFormData(validFormData)),
    ).rejects.toThrow("NEXT_REDIRECT: /conversations/conv-new");

    expect(createNewConversationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        title: "テスト会話",
        idolGroup: "nogizaka",
        activePeriods: [{ startDate: "2026-01-01", endDate: null }],
        participants: [{ name: "メンバーA" }],
      }),
    );
    expect(redirectMock).toHaveBeenCalledWith("/conversations/conv-new");
  });
});
