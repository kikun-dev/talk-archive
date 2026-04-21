import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateDisplayNameAction } from "./actions";

const createSupabaseServerClientMock = vi.fn();
const updateDisplayNameMock = vi.fn();
const validateDisplayNameMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    createSupabaseServerClientMock(...args),
}));

vi.mock("@/usecases/userSettingsUseCases", () => ({
  updateDisplayName: (...args: unknown[]) => updateDisplayNameMock(...args),
  validateDisplayName: (...args: unknown[]) =>
    validateDisplayNameMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

function mockSupabaseUser(user: { id: string } | null) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  });
}

function createFormData(displayName: string): FormData {
  const formData = new FormData();
  formData.set("displayName", displayName);
  return formData;
}

describe("updateDisplayNameAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateDisplayNameMock.mockReturnValue(null);
  });

  it("redirects to /login when user is not authenticated", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      updateDisplayNameAction(undefined, createFormData("太郎")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("returns error when displayName is not a string", async () => {
    mockSupabaseUser({ id: "user-1" });
    const formData = new FormData();

    const result = await updateDisplayNameAction(undefined, formData);

    expect(result).toEqual({ error: "表示名のデータが不正です" });
  });

  it("returns validation error", async () => {
    mockSupabaseUser({ id: "user-1" });
    validateDisplayNameMock.mockReturnValue("表示名は50文字以内で入力してください");

    const result = await updateDisplayNameAction(
      undefined,
      createFormData("あ".repeat(51)),
    );

    expect(result).toEqual({
      error: "表示名は50文字以内で入力してください",
    });
    expect(updateDisplayNameMock).not.toHaveBeenCalled();
  });

  it("updates display name and revalidates", async () => {
    mockSupabaseUser({ id: "user-1" });
    updateDisplayNameMock.mockResolvedValue({});

    const result = await updateDisplayNameAction(
      undefined,
      createFormData("太郎"),
    );

    expect(result).toEqual({ success: true });
    expect(updateDisplayNameMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "太郎",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("returns error when updateDisplayName throws", async () => {
    mockSupabaseUser({ id: "user-1" });
    updateDisplayNameMock.mockRejectedValue(new Error("DB error"));

    const result = await updateDisplayNameAction(
      undefined,
      createFormData("太郎"),
    );

    expect(result).toEqual({
      error: "表示名の更新に失敗しました。時間をおいて再度お試しください。",
    });
  });
});
