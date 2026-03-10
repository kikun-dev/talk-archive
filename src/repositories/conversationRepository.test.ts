import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} from "./conversationRepository";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];

const baseRow: ConversationRow = {
  id: "conv-1",
  user_id: "user-1",
  source_id: null,
  title: "テスト会話",
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

describe("conversationRepository", () => {
  let builder: Record<string, ReturnType<typeof vi.fn>>;
  let client: SupabaseClient<Database>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getConversations", () => {
    it("returns conversations mapped to domain type", async () => {
      builder = createMockQueryBuilder({
        order: vi.fn().mockResolvedValue({ data: [baseRow], error: null }),
      });
      client = createMockClient(builder);

      const result = await getConversations(client, "user-1");

      expect(result).toEqual([
        {
          id: "conv-1",
          userId: "user-1",
          sourceId: null,
          title: "テスト会話",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ]);
      expect(client.from).toHaveBeenCalledWith("conversations");
      expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(builder.order).toHaveBeenCalledWith("updated_at", {
        ascending: false,
      });
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      builder = createMockQueryBuilder({
        order: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(getConversations(client, "user-1")).rejects.toEqual(
        dbError,
      );
    });
  });

  describe("getConversation", () => {
    it("returns a single conversation", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await getConversation(client, "conv-1");

      expect(result).toEqual({
        id: "conv-1",
        userId: "user-1",
        sourceId: null,
        title: "テスト会話",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      expect(builder.eq).toHaveBeenCalledWith("id", "conv-1");
    });

    it("returns null when not found", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      });
      client = createMockClient(builder);

      const result = await getConversation(client, "nonexistent");

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

      await expect(getConversation(client, "conv-1")).rejects.toEqual(
        dbError,
      );
    });
  });

  describe("createConversation", () => {
    it("creates and returns a conversation", async () => {
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await createConversation(client, {
        userId: "user-1",
        title: "テスト会話",
      });

      expect(result.id).toBe("conv-1");
      expect(result.title).toBe("テスト会話");
      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "テスト会話",
        source_id: null,
      });
    });

    it("creates with sourceId", async () => {
      const rowWithSource = { ...baseRow, source_id: "source-1" };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: rowWithSource, error: null }),
      });
      client = createMockClient(builder);

      const result = await createConversation(client, {
        userId: "user-1",
        title: "テスト会話",
        sourceId: "source-1",
      });

      expect(result.sourceId).toBe("source-1");
      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "テスト会話",
        source_id: "source-1",
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
        createConversation(client, { userId: "user-1", title: "テスト" }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("updateConversation", () => {
    it("updates title", async () => {
      const updatedRow = { ...baseRow, title: "更新後" };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: updatedRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await updateConversation(client, "conv-1", {
        title: "更新後",
      });

      expect(result.title).toBe("更新後");
      expect(builder.update).toHaveBeenCalledWith({ title: "更新後" });
      expect(builder.eq).toHaveBeenCalledWith("id", "conv-1");
    });

    it("updates sourceId", async () => {
      const updatedRow = { ...baseRow, source_id: "source-2" };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: updatedRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await updateConversation(client, "conv-1", {
        sourceId: "source-2",
      });

      expect(result.sourceId).toBe("source-2");
      expect(builder.update).toHaveBeenCalledWith({
        source_id: "source-2",
      });
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
        updateConversation(client, "conv-1", { title: "test" }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("deleteConversation", () => {
    it("deletes a conversation", async () => {
      builder = createMockQueryBuilder({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      client = createMockClient(builder);

      await expect(
        deleteConversation(client, "conv-1"),
      ).resolves.toBeUndefined();
      expect(client.from).toHaveBeenCalledWith("conversations");
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "conv-1");
    });

    it("throws on error", async () => {
      const dbError = { message: "Delete error", code: "42000" };
      builder = createMockQueryBuilder({
        eq: vi.fn().mockResolvedValue({ error: dbError }),
      });
      client = createMockClient(builder);

      await expect(deleteConversation(client, "conv-1")).rejects.toEqual(
        dbError,
      );
    });
  });
});
