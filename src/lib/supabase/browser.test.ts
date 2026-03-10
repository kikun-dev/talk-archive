import { describe, expect, it, vi, beforeEach } from "vitest";

describe("createSupabaseBrowserClient", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("creates a browser client when env vars are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

    const { createSupabaseBrowserClient } = await import("./browser");
    const client = createSupabaseBrowserClient();
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });

  it("throws when env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const { createSupabaseBrowserClient } = await import("./browser");
    expect(() => createSupabaseBrowserClient()).toThrow();
  });
});
