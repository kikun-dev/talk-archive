import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getRecordsByConversation,
  getRecord,
  createRecord,
  createTextRecordAtNextPosition,
  createMediaRecordAtNextPosition,
  getNextRecordPosition,
  updateRecord,
  deleteRecord,
  searchRecords,
} from "./recordRepository";

type RecordRow = Database["public"]["Tables"]["records"]["Row"];

const baseRow: RecordRow = {
  id: "rec-1",
  conversation_id: "conv-1",
  record_type: "text",
  title: "テストタイトル",
  content: "テスト内容",
  has_audio: false,
  speaker_participant_id: "part-1",
  posted_at: "2026-01-01T12:00:00Z",
  position: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const baseSearchRow = {
  ...baseRow,
  conversations: {
    id: "conv-1",
    title: "会話タイトル",
    user_id: "user-1",
  },
};

function createMockQueryBuilder(overrides: Record<string, unknown> = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "rpc",
    "eq",
    "ilike",
    "or",
    "order",
    "limit",
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

describe("recordRepository", () => {
  let builder: Record<string, ReturnType<typeof vi.fn>>;
  let client: SupabaseClient<Database>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getRecordsByConversation", () => {
    it("returns records ordered by posted_at then position", async () => {
      const rows = [
        baseRow,
        { ...baseRow, id: "rec-2", position: 1, title: "2番目" },
      ];
      builder = createMockQueryBuilder();
      const orderMock = vi.fn()
        .mockReturnValueOnce(builder)
        .mockResolvedValueOnce({ data: rows, error: null });
      builder.order = orderMock;
      client = createMockClient(builder);

      const result = await getRecordsByConversation(client, "conv-1");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("rec-1");
      expect(result[0].conversationId).toBe("conv-1");
      expect(result[0].recordType).toBe("text");
      expect(result[1].position).toBe(1);
      expect(builder.eq).toHaveBeenCalledWith("conversation_id", "conv-1");
      expect(orderMock).toHaveBeenCalledWith("posted_at", {
        ascending: true,
      });
      expect(orderMock).toHaveBeenCalledWith("position", {
        ascending: true,
      });
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      builder = createMockQueryBuilder();
      builder.order = vi.fn()
        .mockReturnValueOnce(builder)
        .mockResolvedValueOnce({ data: null, error: dbError });
      client = createMockClient(builder);

      await expect(
        getRecordsByConversation(client, "conv-1"),
      ).rejects.toEqual(dbError);
    });
  });

  describe("getRecord", () => {
    it("returns a single record", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await getRecord(client, "rec-1");

      expect(result).toEqual({
        id: "rec-1",
        conversationId: "conv-1",
        recordType: "text",
        title: "テストタイトル",
        content: "テスト内容",
        hasAudio: false,
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00Z",
        position: 0,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
    });

    it("returns null when not found", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      });
      client = createMockClient(builder);

      const result = await getRecord(client, "nonexistent");

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

      await expect(getRecord(client, "rec-1")).rejects.toEqual(dbError);
    });
  });

  describe("createRecord", () => {
    it("creates a text record", async () => {
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await createRecord(client, {
        conversationId: "conv-1",
        recordType: "text",
        content: "テスト内容",
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00Z",
      });

      expect(result.id).toBe("rec-1");
      expect(result.recordType).toBe("text");
      expect(builder.insert).toHaveBeenCalledWith({
        conversation_id: "conv-1",
        record_type: "text",
        title: null,
        content: "テスト内容",
        has_audio: false,
        speaker_participant_id: "part-1",
        posted_at: "2026-01-01T12:00:00Z",
        position: 0,
      });
    });

    it("creates a record with all optional fields", async () => {
      const imageRow: RecordRow = {
        ...baseRow,
        record_type: "image",
        has_audio: true,
        position: 3,
      };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: imageRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await createRecord(client, {
        conversationId: "conv-1",
        recordType: "image",
        title: "テストタイトル",
        content: "テスト内容",
        hasAudio: true,
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00Z",
        position: 3,
      });

      expect(result.recordType).toBe("image");
      expect(result.hasAudio).toBe(true);
      expect(result.position).toBe(3);
      expect(builder.insert).toHaveBeenCalledWith({
        conversation_id: "conv-1",
        record_type: "image",
        title: "テストタイトル",
        content: "テスト内容",
        has_audio: true,
        speaker_participant_id: "part-1",
        posted_at: "2026-01-01T12:00:00Z",
        position: 3,
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
        createRecord(client, {
          conversationId: "conv-1",
          recordType: "text",
          content: "テスト",
          speakerParticipantId: "part-1",
          postedAt: "2026-01-01T12:00:00Z",
        }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("updateRecord", () => {
    it("updates content", async () => {
      const updatedRow = { ...baseRow, content: "更新後の内容" };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: updatedRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await updateRecord(client, "rec-1", {
        content: "更新後の内容",
      });

      expect(result.content).toBe("更新後の内容");
      expect(builder.update).toHaveBeenCalledWith({
        content: "更新後の内容",
      });
      expect(builder.eq).toHaveBeenCalledWith("id", "rec-1");
    });

    it("updates multiple fields", async () => {
      const updatedRow = {
        ...baseRow,
        title: "新タイトル",
        has_audio: true,
        position: 5,
      };
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: updatedRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await updateRecord(client, "rec-1", {
        title: "新タイトル",
        hasAudio: true,
        position: 5,
      });

      expect(result.title).toBe("新タイトル");
      expect(result.hasAudio).toBe(true);
      expect(result.position).toBe(5);
      expect(builder.update).toHaveBeenCalledWith({
        title: "新タイトル",
        has_audio: true,
        position: 5,
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
        updateRecord(client, "rec-1", { content: "test" }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("createTextRecordAtNextPosition", () => {
    it("creates a text record via rpc", async () => {
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await createTextRecordAtNextPosition(client, {
        conversationId: "conv-1",
        title: "テストタイトル",
        content: "テスト内容",
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00Z",
      });

      expect(result.id).toBe("rec-1");
      expect(result.position).toBe(0);
      expect(client.rpc).toHaveBeenCalledWith("append_text_record", {
        p_conversation_id: "conv-1",
        p_title: "テストタイトル",
        p_content: "テスト内容",
        p_speaker_participant_id: "part-1",
        p_posted_at: "2026-01-01T12:00:00Z",
      });
    });

    it("throws on rpc error", async () => {
      const dbError = { message: "RPC error", code: "23505" };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        createTextRecordAtNextPosition(client, {
          conversationId: "conv-1",
          title: null,
          content: "テスト内容",
          speakerParticipantId: "part-1",
          postedAt: "2026-01-01T12:00:00Z",
        }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("createMediaRecordAtNextPosition", () => {
    it("creates a media record via rpc", async () => {
      const imageRow: RecordRow = {
        ...baseRow,
        id: "rec-img-1",
        record_type: "image",
        has_audio: true,
        position: 3,
      };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: imageRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await createMediaRecordAtNextPosition(client, {
        conversationId: "conv-1",
        recordType: "image",
        title: "テストタイトル",
        content: "テスト内容",
        hasAudio: true,
        speakerParticipantId: "part-1",
        postedAt: "2026-01-01T12:00:00Z",
      });

      expect(result.id).toBe("rec-img-1");
      expect(result.recordType).toBe("image");
      expect(result.position).toBe(3);
      expect(client.rpc).toHaveBeenCalledWith("append_media_record", {
        p_conversation_id: "conv-1",
        p_record_type: "image",
        p_title: "テストタイトル",
        p_content: "テスト内容",
        p_has_audio: true,
        p_speaker_participant_id: "part-1",
        p_posted_at: "2026-01-01T12:00:00Z",
      });
    });

    it("throws on rpc error", async () => {
      const dbError = { message: "RPC error", code: "23505" };
      builder = createMockQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        createMediaRecordAtNextPosition(client, {
          conversationId: "conv-1",
          recordType: "audio",
          title: null,
          content: null,
          hasAudio: false,
          speakerParticipantId: "part-1",
          postedAt: "2026-01-01T12:00:00Z",
        }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("deleteRecord", () => {
    it("deletes a record", async () => {
      builder = createMockQueryBuilder({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      client = createMockClient(builder);

      await expect(
        deleteRecord(client, "rec-1"),
      ).resolves.toBeUndefined();
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "rec-1");
    });

    it("throws on error", async () => {
      const dbError = { message: "Delete error", code: "42000" };
      builder = createMockQueryBuilder({
        eq: vi.fn().mockResolvedValue({ error: dbError }),
      });
      client = createMockClient(builder);

      await expect(deleteRecord(client, "rec-1")).rejects.toEqual(dbError);
    });
  });

  describe("getNextRecordPosition", () => {
    it("returns max position + 1 when records exist", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: { position: 5 }, error: null }),
      });
      client = createMockClient(builder);

      const result = await getNextRecordPosition(client, "conv-1");

      expect(result).toBe(6);
      expect(builder.select).toHaveBeenCalledWith("position");
      expect(builder.eq).toHaveBeenCalledWith("conversation_id", "conv-1");
      expect(builder.order).toHaveBeenCalledWith("position", {
        ascending: false,
      });
      expect(builder.limit).toHaveBeenCalledWith(1);
    });

    it("returns 0 when no records exist", async () => {
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: null }),
      });
      client = createMockClient(builder);

      const result = await getNextRecordPosition(client, "conv-1");

      expect(result).toBe(0);
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      builder = createMockQueryBuilder({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        getNextRecordPosition(client, "conv-1"),
      ).rejects.toEqual(dbError);
    });
  });

  describe("searchRecords", () => {
    it("searches records by title and content with conversation context", async () => {
      builder = createMockQueryBuilder({
        order: vi
          .fn()
          .mockResolvedValue({ data: [baseSearchRow], error: null }),
      });
      client = createMockClient(builder);

      const result = await searchRecords(client, {
        userId: "user-1",
        query: "テスト",
      });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("テスト内容");
      expect(result[0].conversationTitle).toBe("会話タイトル");
      expect(builder.select).toHaveBeenCalledWith(
        "*, conversations!inner(id, title, user_id)",
      );
      expect(builder.eq).toHaveBeenCalledWith(
        "conversations.user_id",
        "user-1",
      );
      expect(builder.or).toHaveBeenCalledWith(
        "content.ilike.%テスト%,title.ilike.%テスト%",
      );
      expect(builder.order).toHaveBeenCalledWith("posted_at", {
        ascending: false,
      });
    });

    it("filters by conversationId when provided", async () => {
      builder = createMockQueryBuilder({
        order: vi
          .fn()
          .mockResolvedValue({ data: [baseSearchRow], error: null }),
      });
      client = createMockClient(builder);

      await searchRecords(client, {
        userId: "user-1",
        query: "テスト",
        conversationId: "conv-1",
      });

      expect(builder.eq).toHaveBeenNthCalledWith(
        2,
        "conversation_id",
        "conv-1",
      );
    });

    it("returns empty array when no matches", async () => {
      builder = createMockQueryBuilder({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      client = createMockClient(builder);

      const result = await searchRecords(client, {
        userId: "user-1",
        query: "存在しない",
      });

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      const dbError = { message: "Search error", code: "42000" };
      builder = createMockQueryBuilder({
        order: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        searchRecords(client, {
          userId: "user-1",
          query: "テスト",
        }),
      ).rejects.toEqual(dbError);
    });
  });
});
