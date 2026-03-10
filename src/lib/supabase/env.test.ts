import { describe, expect, it, vi, beforeEach } from "vitest";

describe("getSupabaseEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");

    const { getSupabaseEnv } = await import("./env");
    expect(() => getSupabaseEnv()).toThrow("NEXT_PUBLIC_SUPABASE_URL is not set.");
  });

  it("throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const { getSupabaseEnv } = await import("./env");
    expect(() => getSupabaseEnv()).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");
  });

  it("returns url and anonKey when env vars are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

    const { getSupabaseEnv } = await import("./env");
    const result = getSupabaseEnv();
    expect(result).toEqual({
      url: "https://example.supabase.co",
      anonKey: "test-anon-key",
    });
  });
});
