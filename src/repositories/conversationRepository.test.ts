import { beforeEach, describe, expect, it, vi } from "vitest";
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
  });

  it("returns a single conversation", async () => {
    builder = createMockQueryBuilder({
      maybeSingle: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
    });
    client = createMockClient(builder);

    const result = await getConversation(client, "conv-1");

    expect(result?.id).toBe("conv-1");
    expect(result?.idolGroup).toBe("nogizaka");
  });

  it("creates a conversation", async () => {
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
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      title: "テスト会話",
      idol_group: "nogizaka",
      source_id: null,
      cover_image_path: null,
    });
  });

  it("creates conversation metadata via rpc", async () => {
    builder = createMockQueryBuilder({
      single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
    });
    client = createMockClient(builder);

    await createConversationWithMetadata(client, {
      userId: "user-1",
      idolGroup: "nogizaka",
      title: "テスト会話",
      activePeriods: [{ startDate: "2026-01-01", endDate: "2026-01-10" }],
      participants: [{ name: "メンバーA" }, { name: "メンバーB" }],
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "create_conversation_with_metadata",
      {
        p_user_id: "user-1",
        p_title: "テスト会話",
        p_idol_group: "nogizaka",
        p_source_id: null,
        p_cover_image_path: null,
        p_active_periods: [
          {
            start_date: "2026-01-01",
            end_date: "2026-01-10",
          },
        ],
        p_participants: [
          { name: "メンバーA", sort_order: 0 },
          { name: "メンバーB", sort_order: 1 },
        ],
      },
    );
  });

  it("updates a conversation", async () => {
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

  it("updates conversation metadata via rpc", async () => {
    builder = createMockQueryBuilder({
      single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
    });
    client = createMockClient(builder);

    await updateConversationWithMetadata(client, "conv-1", {
      participants: [{ name: "メンバーA" }],
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "update_conversation_with_metadata",
      {
        p_conversation_id: "conv-1",
        p_title: null,
        p_has_title: false,
        p_idol_group: null,
        p_has_idol_group: false,
        p_source_id: null,
        p_has_source_id: false,
        p_cover_image_path: null,
        p_has_cover_image_path: false,
        p_active_periods: [],
        p_has_active_periods: false,
        p_participants: [{ id: null, name: "メンバーA", sort_order: 0 }],
        p_has_participants: true,
      },
    );
  });

  it("deletes a conversation", async () => {
    builder = createMockQueryBuilder({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    client = createMockClient(builder);

    await deleteConversation(client, "conv-1");

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "conv-1");
  });
});
