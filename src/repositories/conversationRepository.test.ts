import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  createConversation,
  createConversationWithMetadata,
  deleteConversation,
  getConversation,
  getConversations,
  updateConversation,
  updateConversationWithMetadata,
} from "./conversationRepository";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];

const baseRow: ConversationRow = {
  id: "conv-1",
  user_id: "user-1",
  source_id: null,
  idol_group: "nogizaka",
  cover_image_path: null,
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
    rpc: vi.fn().mockReturnValue(builder),
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
          idolGroup: "nogizaka",
          coverImagePath: null,
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
        maybeSingle: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await getConversation(client, "conv-1");

      expect(result).toEqual({
        id: "conv-1",
        userId: "user-1",
        sourceId: null,
        idolGroup: "nogizaka",
        coverImagePath: null,
        title: "テスト会話",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      expect(builder.eq).toHaveBeenCalledWith("id", "conv-1");
    });

    it("returns null when not found", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      client = createMockClient(builder);

      const result = await getConversation(client, "nonexistent");

      expect(result).toBeNull();
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      builder = createMockQueryBuilder({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
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
        idolGroup: "nogizaka",
        title: "テスト会話",
      });

      expect(result.id).toBe("conv-1");
      expect(result.title).toBe("テスト会話");
      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "テスト会話",
        idol_group: "nogizaka",
        source_id: null,
        cover_image_path: null,
      });
    });

    it("creates with sourceId", async () => {
      const rowWithSource = { ...baseRow, source_id: "source-1" };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: rowWithSource, error: null }),
      });
      client = createMockClient(builder);

      const result = await createConversation(client, {
        userId: "user-1",
        idolGroup: "nogizaka",
        title: "テスト会話",
        sourceId: "source-1",
      });

      expect(result.sourceId).toBe("source-1");
      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "テスト会話",
        idol_group: "nogizaka",
        source_id: "source-1",
        cover_image_path: null,
      });
    });

    it("creates with coverImagePath", async () => {
      const rowWithCover = {
        ...baseRow,
        cover_image_path: "user-1/conv-1/cover/main.jpg",
      };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: rowWithCover, error: null }),
      });
      client = createMockClient(builder);

      const result = await createConversation(client, {
        userId: "user-1",
        idolGroup: "sakurazaka",
        title: "テスト会話",
        coverImagePath: "user-1/conv-1/cover/main.jpg",
      });

      expect(result.coverImagePath).toBe("user-1/conv-1/cover/main.jpg");
      expect(builder.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "テスト会話",
        idol_group: "sakurazaka",
        source_id: null,
        cover_image_path: "user-1/conv-1/cover/main.jpg",
      });
    });

    it("throws on error", async () => {
      const dbError = { message: "Insert error", code: "23505" };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        createConversation(client, {
          userId: "user-1",
          idolGroup: "nogizaka",
          title: "テスト",
        }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("createConversationWithMetadata", () => {
    it("creates conversation and periods via rpc", async () => {
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await createConversationWithMetadata(client, {
        userId: "user-1",
        idolGroup: "nogizaka",
        title: "テスト会話",
        coverImagePath: "user-1/conv-1/cover/main.jpg",
        activePeriods: [{ startDate: "2026-01-01", endDate: "2026-01-10" }],
      });

      expect(result.id).toBe("conv-1");
      expect(client.rpc).toHaveBeenCalledWith(
        "create_conversation_with_metadata",
        {
          p_user_id: "user-1",
          p_title: "テスト会話",
          p_idol_group: "nogizaka",
          p_source_id: null,
          p_cover_image_path: "user-1/conv-1/cover/main.jpg",
          p_active_periods: [
            {
              start_date: "2026-01-01",
              end_date: "2026-01-10",
            },
          ],
        },
      );
    });
  });

  describe("updateConversation", () => {
    it("updates title", async () => {
      const updatedRow = { ...baseRow, title: "更新後" };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await updateConversation(client, "conv-1", {
        title: "更新後",
      });

      expect(result.title).toBe("更新後");
      expect(builder.update).toHaveBeenCalledWith({
        title: "更新後",
      });
    });

    it("updates idolGroup and coverImagePath", async () => {
      const updatedRow = {
        ...baseRow,
        idol_group: "hinatazaka" as const,
        cover_image_path: "user-1/conv-1/cover/updated.jpg",
      };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await updateConversation(client, "conv-1", {
        idolGroup: "hinatazaka",
        coverImagePath: "user-1/conv-1/cover/updated.jpg",
      });

      expect(result.idolGroup).toBe("hinatazaka");
      expect(result.coverImagePath).toBe("user-1/conv-1/cover/updated.jpg");
      expect(builder.update).toHaveBeenCalledWith({
        idol_group: "hinatazaka",
        cover_image_path: "user-1/conv-1/cover/updated.jpg",
      });
    });

    it("throws on error", async () => {
      const dbError = { message: "Update error", code: "42000" };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        updateConversation(client, "conv-1", { title: "更新後" }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("updateConversationWithMetadata", () => {
    it("updates conversation and periods via rpc", async () => {
      const updatedRow = {
        ...baseRow,
        title: "更新後",
        idol_group: "hinatazaka" as const,
      };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await updateConversationWithMetadata(client, "conv-1", {
        title: "更新後",
        idolGroup: "hinatazaka",
        sourceId: null,
        coverImagePath: null,
        activePeriods: [{ startDate: "2026-01-01", endDate: null }],
      });

      expect(result.idolGroup).toBe("hinatazaka");
      expect(client.rpc).toHaveBeenCalledWith(
        "update_conversation_with_metadata",
        {
          p_conversation_id: "conv-1",
          p_title: "更新後",
          p_has_title: true,
          p_idol_group: "hinatazaka",
          p_has_idol_group: true,
          p_source_id: null,
          p_has_source_id: true,
          p_cover_image_path: null,
          p_has_cover_image_path: true,
          p_active_periods: [
            {
              start_date: "2026-01-01",
              end_date: null,
            },
          ],
        },
      );
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
