import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateDisplayName,
  getDisplayName,
  updateDisplayName,
} from "./userSettingsUseCases";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { UserSettings } from "@/types/domain";

const getUserSettingsMock = vi.fn();
const upsertUserSettingsMock = vi.fn();

vi.mock("@/repositories/userSettingsRepository", () => ({
  getUserSettings: (...args: unknown[]) => getUserSettingsMock(...args),
  upsertUserSettings: (...args: unknown[]) => upsertUserSettingsMock(...args),
}));

const client = {} as SupabaseClient<Database>;

const baseSettings: UserSettings = {
  id: "settings-1",
  userId: "user-1",
  displayName: "太郎",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("validateDisplayName", () => {
  it("returns null for valid name", () => {
    expect(validateDisplayName("太郎")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(validateDisplayName("")).toBeNull();
  });

  it("returns null for name at max length", () => {
    expect(validateDisplayName("あ".repeat(50))).toBeNull();
  });

  it("returns error for name exceeding max length", () => {
    expect(validateDisplayName("あ".repeat(51))).toBe(
      "表示名は50文字以内で入力してください",
    );
  });

  it("trims whitespace before checking length", () => {
    const name = "あ".repeat(50) + "  ";
    expect(validateDisplayName(name)).toBeNull();
  });
});

describe("getDisplayName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns display name when settings exist", async () => {
    getUserSettingsMock.mockResolvedValue(baseSettings);

    const result = await getDisplayName(client, "user-1");

    expect(result).toBe("太郎");
    expect(getUserSettingsMock).toHaveBeenCalledWith(client, "user-1");
  });

  it("returns empty string when no settings exist", async () => {
    getUserSettingsMock.mockResolvedValue(null);

    const result = await getDisplayName(client, "user-1");

    expect(result).toBe("");
  });
});

describe("updateDisplayName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trims and upserts display name", async () => {
    upsertUserSettingsMock.mockResolvedValue(baseSettings);

    const result = await updateDisplayName(client, "user-1", "  太郎  ");

    expect(result).toEqual(baseSettings);
    expect(upsertUserSettingsMock).toHaveBeenCalledWith(
      client,
      "user-1",
      "太郎",
    );
  });

  it("throws when name exceeds max length", async () => {
    await expect(
      updateDisplayName(client, "user-1", "あ".repeat(51)),
    ).rejects.toThrow("表示名は50文字以内で入力してください");

    expect(upsertUserSettingsMock).not.toHaveBeenCalled();
  });

  it("allows empty string to clear display name", async () => {
    const emptySettings = { ...baseSettings, displayName: "" };
    upsertUserSettingsMock.mockResolvedValue(emptySettings);

    const result = await updateDisplayName(client, "user-1", "");

    expect(result.displayName).toBe("");
    expect(upsertUserSettingsMock).toHaveBeenCalledWith(client, "user-1", "");
  });
});
