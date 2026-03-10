import { beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();
const createServerClientMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

describe("createSupabaseServerClient", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    cookiesMock.mockReset();
    createServerClientMock.mockReset();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("writes cookies when the request context is mutable", async () => {
    const getAll = vi.fn(() => []);
    const set = vi.fn();

    cookiesMock.mockResolvedValue({ getAll, set });
    createServerClientMock.mockImplementation((_url, _anonKey, options) => {
      options.cookies.setAll([
        {
          name: "sb-access-token",
          value: "next-token",
          options: { path: "/" },
        },
      ]);

      return { auth: {} };
    });

    const { createSupabaseServerClient } = await import("./server");
    const client = await createSupabaseServerClient();

    expect(client).toEqual({ auth: {} });
    expect(set).toHaveBeenCalledWith("sb-access-token", "next-token", {
      path: "/",
    });
  });

  it("ignores cookie write errors in immutable contexts", async () => {
    const getAll = vi.fn(() => []);
    const set = vi.fn(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    });

    cookiesMock.mockResolvedValue({ getAll, set });
    createServerClientMock.mockImplementation((_url, _anonKey, options) => {
      expect(() =>
        options.cookies.setAll([
          {
            name: "sb-refresh-token",
            value: "refresh-token",
            options: { path: "/" },
          },
        ]),
      ).not.toThrow();

      return { auth: {} };
    });

    const { createSupabaseServerClient } = await import("./server");
    const client = await createSupabaseServerClient();

    expect(client).toEqual({ auth: {} });
    expect(set).toHaveBeenCalledTimes(1);
  });
});
