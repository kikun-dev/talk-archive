import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getSources,
  getSource,
  createSource,
  updateSource,
  deleteSource,
} from "./sourceRepository";

type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

const baseRow: SourceRow = {
  id: "src-1",
  user_id: "user-1",
  name: "LINE",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function createMockQueryBuilder(overrides: Record<string, unknown> = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "order",
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

describe("sourceRepository", () => {
  let builder: Record<string, ReturnType<typeof vi.fn>>;
  let client: SupabaseClient<Database>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getSources", () => {
    it("returns sources ordered by name", async () => {
      const rows = [baseRow, { ...baseRow, id: "src-2", name: "Slack" }];
      builder = createMockQueryBuilder({
        order: vi.fn().mockResolvedValue({ data: rows, error: null }),
      });
      client = createMockClient(builder);

      const result = await getSources(client, "user-1");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "src-1",
        userId: "user-1",
        name: "LINE",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      expect(result[1].name).toBe("Slack");
      expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(builder.order).toHaveBeenCalledWith("name", {
        ascending: true,
      });
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      builder = createMockQueryBuilder({
        order: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(getSources(client, "user-1")).rejects.toEqual(dbError);
    });
  });

  describe("getSource", () => {
    it("returns a single source", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await getSource(client, "src-1");

      expect(result).toEqual({
        id: "src-1",
        userId: "user-1",
        name: "LINE",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      expect(builder.eq).toHaveBeenCalledWith("id", "src-1");
    });

    it("returns null when not found", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      });
      client = createMockClient(builder);

      const result = await getSource(client, "nonexistent");

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

      await expect(getSource(client, "src-1")).rejects.toEqual(dbError);
    });
  });

  describe("createSource", () => {
    it("creates and returns a source", async () => {
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await createSource(client, {
        userId: "user-1",
        name: "LINE",
      });

      expect(result.id).toBe("src-1");
      expect(result.name).toBe("LINE");
      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        name: "LINE",
      });
    });

    it("throws on error", async () => {
      const dbError = { message: "Insert error", code: "23505" };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        createSource(client, { userId: "user-1", name: "LINE" }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("updateSource", () => {
    it("updates name", async () => {
      const updatedRow = { ...baseRow, name: "Discord" };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: updatedRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await updateSource(client, "src-1", {
        name: "Discord",
      });

      expect(result.name).toBe("Discord");
      expect(builder.update).toHaveBeenCalledWith({ name: "Discord" });
      expect(builder.eq).toHaveBeenCalledWith("id", "src-1");
    });

    it("throws on error", async () => {
      const dbError = { message: "Update error", code: "42000" };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        updateSource(client, "src-1", { name: "test" }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("deleteSource", () => {
    it("deletes a source", async () => {
      builder = createMockQueryBuilder({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      client = createMockClient(builder);

      await expect(
        deleteSource(client, "src-1"),
      ).resolves.toBeUndefined();
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "src-1");
    });

    it("throws on error", async () => {
      const dbError = { message: "Delete error", code: "42000" };
      builder = createMockQueryBuilder({
        eq: vi.fn().mockResolvedValue({ error: dbError }),
      });
      client = createMockClient(builder);

      await expect(deleteSource(client, "src-1")).rejects.toEqual(
        dbError,
      );
    });
  });
});
