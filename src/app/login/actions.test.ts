import { describe, expect, it, vi, beforeEach } from "vitest";

const signInWithPasswordMock = vi.fn();
const signOutMock = vi.fn();
const createSupabaseServerClientMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

function mockSupabaseClient() {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signOut: signOutMock,
    },
  });
}

function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.set(key, value);
  }
  return formData;
}

describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient();
  });

  it("returns error when email or password is missing", async () => {
    const { login } = await import("./actions");
    const result = await login(new FormData());

    expect(result).toEqual({
      error: "メールアドレスとパスワードを入力してください。",
    });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("returns error when signInWithPassword fails", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: new Error("Invalid credentials"),
    });

    const { login } = await import("./actions");
    const formData = createFormData({
      email: "test@example.com",
      password: "wrong",
    });
    const result = await login(formData);

    expect(result).toEqual({
      error: "メールアドレスまたはパスワードが正しくありません。",
    });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "wrong",
    });
  });

  it("revalidates and redirects on successful login", async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null });

    const { login } = await import("./actions");
    const formData = createFormData({
      email: "test@example.com",
      password: "correct",
    });
    await login(formData);

    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});

describe("logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient();
  });

  it("signs out, revalidates and redirects to login", async () => {
    signOutMock.mockResolvedValue({});

    const { logout } = await import("./actions");
    await logout();

    expect(signOutMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
