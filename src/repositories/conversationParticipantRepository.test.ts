import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getConversationParticipants,
  updateConversationParticipantThumbnail,
} from "./conversationParticipantRepository";

type ConversationParticipantRow =
  Database["public"]["Tables"]["conversation_participants"]["Row"];

const baseRow: ConversationParticipantRow = {
  id: "participant-1",
  conversation_id: "conv-1",
  name: "メンバーA",
  sort_order: 0,
  thumbnail_path: "user-1/participants/participant-1/photo.jpg",
  created_at: "2026-01-01T00:00:00Z",
};

function createMockQueryBuilder(overrides: Record<string, unknown> = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "update", "eq", "order", "single"];
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

describe("conversationParticipantRepository", () => {
  let builder: Record<string, ReturnType<typeof vi.fn>>;
  let client: SupabaseClient<Database>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns participants ordered by sort order", async () => {
    builder = createMockQueryBuilder({
      order: vi.fn().mockResolvedValue({ data: [baseRow], error: null }),
    });
    client = createMockClient(builder);

    const result = await getConversationParticipants(client, "conv-1");

    expect(result).toEqual([
      {
        id: "participant-1",
        conversationId: "conv-1",
        name: "メンバーA",
        sortOrder: 0,
        thumbnailPath: "user-1/participants/participant-1/photo.jpg",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(builder.eq).toHaveBeenCalledWith("conversation_id", "conv-1");
    expect(builder.order).toHaveBeenCalledWith("sort_order", {
      ascending: true,
    });
  });

  it("updates participant thumbnail path", async () => {
    builder = createMockQueryBuilder({
      single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
    });
    client = createMockClient(builder);

    const result = await updateConversationParticipantThumbnail(client, {
      conversationId: "conv-1",
      participantId: "participant-1",
      thumbnailPath: "user-1/participants/participant-1/photo.jpg",
    });

    expect(result.thumbnailPath).toBe(
      "user-1/participants/participant-1/photo.jpg",
    );
    expect(builder.update).toHaveBeenCalledWith({
      thumbnail_path: "user-1/participants/participant-1/photo.jpg",
    });
    expect(builder.eq).toHaveBeenCalledWith("id", "participant-1");
    expect(builder.eq).toHaveBeenCalledWith("conversation_id", "conv-1");
  });
});
