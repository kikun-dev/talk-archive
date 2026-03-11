import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getConversationActivePeriods,
  listConversationActivePeriods,
} from "./conversationActivePeriodRepository";

type ConversationActivePeriodRow =
  Database["public"]["Tables"]["conversation_active_periods"]["Row"];

const baseRow: ConversationActivePeriodRow = {
  id: "period-1",
  conversation_id: "conv-1",
  start_date: "2026-01-01",
  end_date: "2026-01-10",
  created_at: "2026-01-01T00:00:00Z",
};

function createMockQueryBuilder(overrides: Record<string, unknown> = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "eq", "in", "order"];
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

describe("conversationActivePeriodRepository", () => {
  let builder: Record<string, ReturnType<typeof vi.fn>>;
  let client: SupabaseClient<Database>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns periods ordered by start date", async () => {
    builder = createMockQueryBuilder({
      order: vi.fn().mockResolvedValue({ data: [baseRow], error: null }),
    });
    client = createMockClient(builder);

    const result = await getConversationActivePeriods(client, "conv-1");

    expect(result).toEqual([
      {
        id: "period-1",
        conversationId: "conv-1",
        startDate: "2026-01-01",
        endDate: "2026-01-10",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(builder.eq).toHaveBeenCalledWith("conversation_id", "conv-1");
    expect(builder.order).toHaveBeenCalledWith("start_date", {
      ascending: true,
    });
  });

  it("returns periods for multiple conversations in a single query", async () => {
    builder = createMockQueryBuilder({
      order: vi.fn().mockResolvedValue({
        data: [
          baseRow,
          {
            ...baseRow,
            id: "period-2",
            conversation_id: "conv-2",
          },
        ],
        error: null,
      }),
    });
    client = createMockClient(builder);

    const result = await listConversationActivePeriods(client, [
      "conv-1",
      "conv-2",
    ]);

    expect(result).toHaveLength(2);
    expect(builder.in).toHaveBeenCalledWith("conversation_id", [
      "conv-1",
      "conv-2",
    ]);
    expect(builder.order).toHaveBeenCalledWith("start_date", {
      ascending: true,
    });
  });
});
