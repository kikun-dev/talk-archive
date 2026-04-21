import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getUserSettings, upsertUserSettings } from "./userSettingsRepository";

type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

const baseRow: UserSettingsRow = {
  id: "settings-1",
  user_id: "user-1",
  display_name: "太郎",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function createMockQueryBuilder(overrides: Record<string, unknown> = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select",
    "upsert",
    "eq",
    "single",
    "maybeSingle",
  ];
  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  Object.assign(builder, overrides);
  return builder;
}

function createMockClient(
  builder: Record<string, ReturnType<typeof vi.fn>>,
): SupabaseClient<Database> {
  return {
    from: vi.fn().mockReturnValue(builder),
  } as unknown as SupabaseClient<Database>;
}

describe("userSettingsRepository", () => {
  let builder: Record<string, ReturnType<typeof vi.fn>>;
  let client: SupabaseClient<Database>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getUserSettings", () => {
    it("returns user settings when found", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await getUserSettings(client, "user-1");

      expect(result).toEqual({
        id: "settings-1",
        userId: "user-1",
        displayName: "太郎",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("returns null when not found", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      });
      client = createMockClient(builder);

      const result = await getUserSettings(client, "nonexistent");

      expect(result).toBeNull();
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(getUserSettings(client, "user-1")).rejects.toEqual(
        dbError,
      );
    });
  });

  describe("upsertUserSettings", () => {
    it("upserts and returns user settings", async () => {
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await upsertUserSettings(client, "user-1", "太郎");

      expect(result).toEqual({
        id: "settings-1",
        userId: "user-1",
        displayName: "太郎",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      expect(builder.upsert).toHaveBeenCalledWith(
        { user_id: "user-1", display_name: "太郎" },
        { onConflict: "user_id" },
      );
    });

    it("throws on error", async () => {
      const dbError = { message: "Upsert error", code: "23505" };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        upsertUserSettings(client, "user-1", "太郎"),
      ).rejects.toEqual(dbError);
    });
  });
});
