import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getAttachmentsByRecord,
  getAttachmentsByType,
  createAttachment,
  deleteAttachment,
} from "./attachmentRepository";

type AttachmentRow = Database["public"]["Tables"]["attachments"]["Row"];
type AttachmentWithRecordRow = AttachmentRow & {
  records: {
    conversation_id: string;
    record_type: "text" | "image" | "video" | "audio";
    conversations: {
      user_id: string;
    };
  };
};

const baseRow: AttachmentRow = {
  id: "att-1",
  record_id: "rec-1",
  file_path: "user-1/conv-1/rec-1/photo.jpg",
  mime_type: "image/jpeg",
  file_size: 102400,
  created_at: "2026-01-01T00:00:00Z",
};

function createMockQueryBuilder(overrides: Record<string, unknown> = {}) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select",
    "insert",
    "delete",
    "eq",
    "order",
    "limit",
    "range",
    "single",
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

describe("attachmentRepository", () => {
  let builder: Record<string, ReturnType<typeof vi.fn>>;
  let client: SupabaseClient<Database>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getAttachmentsByRecord", () => {
    it("returns attachments mapped to domain type", async () => {
      builder = createMockQueryBuilder({
        order: vi
          .fn()
          .mockResolvedValue({ data: [baseRow], error: null }),
      });
      client = createMockClient(builder);

      const result = await getAttachmentsByRecord(client, "rec-1");

      expect(result).toEqual([
        {
          id: "att-1",
          recordId: "rec-1",
          filePath: "user-1/conv-1/rec-1/photo.jpg",
          mimeType: "image/jpeg",
          fileSize: 102400,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ]);
      expect(builder.eq).toHaveBeenCalledWith("record_id", "rec-1");
      expect(builder.order).toHaveBeenCalledWith("created_at", {
        ascending: true,
      });
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      builder = createMockQueryBuilder({
        order: vi
          .fn()
          .mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        getAttachmentsByRecord(client, "rec-1"),
      ).rejects.toEqual(dbError);
    });
  });

  describe("getAttachmentsByType", () => {
    it("returns attachments filtered by record type and user", async () => {
      const mediaRow: AttachmentWithRecordRow = {
        ...baseRow,
        records: {
          conversation_id: "conv-1",
          record_type: "image",
          conversations: {
            user_id: "user-1",
          },
        },
      };
      builder = createMockQueryBuilder({
        order: vi
          .fn()
          .mockResolvedValue({ data: [mediaRow], error: null }),
      });
      client = createMockClient(builder);

      const result = await getAttachmentsByType(client, "user-1", "image");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("att-1");
      expect(result[0].conversationId).toBe("conv-1");
      expect(builder.select).toHaveBeenCalledWith(
        "*, records!inner(conversation_id, record_type, conversations!inner(user_id))",
      );
      expect(builder.eq).toHaveBeenCalledWith(
        "records.conversations.user_id",
        "user-1",
      );
      expect(builder.eq).toHaveBeenCalledWith(
        "records.record_type",
        "image",
      );
    });

    it("applies limit option", async () => {
      builder = createMockQueryBuilder({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });
      client = createMockClient(builder);

      await getAttachmentsByType(client, "user-1", "image", {
        limit: 10,
      });

      const orderResult = builder.order.mock.results[0].value;
      expect(orderResult.limit).toHaveBeenCalledWith(10);
    });

    it("applies offset with range", async () => {
      builder = createMockQueryBuilder({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            range: vi
              .fn()
              .mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });
      client = createMockClient(builder);

      await getAttachmentsByType(client, "user-1", "video", {
        limit: 10,
        offset: 20,
      });

      const orderResult = builder.order.mock.results[0].value;
      expect(orderResult.limit).toHaveBeenCalledWith(10);
      const limitResult = orderResult.limit.mock.results[0].value;
      expect(limitResult.range).toHaveBeenCalledWith(20, 29);
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      builder = createMockQueryBuilder({
        order: vi
          .fn()
          .mockResolvedValue({ data: null, error: dbError }),
      });
      client = createMockClient(builder);

      await expect(
        getAttachmentsByType(client, "user-1", "image"),
      ).rejects.toEqual(dbError);
    });
  });

  describe("createAttachment", () => {
    it("creates and returns an attachment", async () => {
      builder = createMockQueryBuilder({
        single: vi
          .fn()
          .mockResolvedValue({ data: baseRow, error: null }),
      });
      client = createMockClient(builder);

      const result = await createAttachment(client, {
        recordId: "rec-1",
        filePath: "user-1/conv-1/rec-1/photo.jpg",
        mimeType: "image/jpeg",
        fileSize: 102400,
      });

      expect(result.id).toBe("att-1");
      expect(result.filePath).toBe("user-1/conv-1/rec-1/photo.jpg");
      expect(builder.insert).toHaveBeenCalledWith({
        record_id: "rec-1",
        file_path: "user-1/conv-1/rec-1/photo.jpg",
        mime_type: "image/jpeg",
        file_size: 102400,
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
        createAttachment(client, {
          recordId: "rec-1",
          filePath: "path/to/file",
          mimeType: "image/png",
          fileSize: 1024,
        }),
      ).rejects.toEqual(dbError);
    });
  });

  describe("deleteAttachment", () => {
    it("deletes an attachment", async () => {
      builder = createMockQueryBuilder({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      client = createMockClient(builder);

      await expect(
        deleteAttachment(client, "att-1"),
      ).resolves.toBeUndefined();
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "att-1");
    });

    it("throws on error", async () => {
      const dbError = { message: "Delete error", code: "42000" };
      builder = createMockQueryBuilder({
        eq: vi.fn().mockResolvedValue({ error: dbError }),
      });
      client = createMockClient(builder);

      await expect(deleteAttachment(client, "att-1")).rejects.toEqual(
        dbError,
      );
    });
  });
});
