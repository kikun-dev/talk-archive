import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getImportDedupCandidates,
  importRecordsAtomic,
} from "./importRepository";

describe("importRepository", () => {
  describe("getImportDedupCandidates", () => {
    it("calls the projection RPC and maps its rows", async () => {
      const rpcMock = vi.fn().mockResolvedValue({
        data: [
          {
            participant_id: "part-1",
            posted_at: "2026-01-01T00:00:00.000Z",
            record_type: "text",
            content_prefix: "12345678901234567890",
          },
        ],
        error: null,
      });
      const client = { rpc: rpcMock } as unknown as SupabaseClient<Database>;

      const result = await getImportDedupCandidates(client, "conv-1");

      expect(rpcMock).toHaveBeenCalledWith("get_import_dedup_candidates", {
        p_conversation_id: "conv-1",
      });
      expect(result).toEqual([
        {
          participantId: "part-1",
          postedAt: "2026-01-01T00:00:00.000Z",
          recordType: "text",
          contentPrefix: "12345678901234567890",
        },
      ]);
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      const rpcMock = vi.fn().mockResolvedValue({ data: null, error: dbError });
      const client = { rpc: rpcMock } as unknown as SupabaseClient<Database>;

      await expect(
        getImportDedupCandidates(client, "conv-1"),
      ).rejects.toEqual(dbError);
    });
  });

  describe("importRecordsAtomic", () => {
    let rpcMock: ReturnType<typeof vi.fn>;
    let client: SupabaseClient<Database>;

    beforeEach(() => {
      vi.resetAllMocks();
      rpcMock = vi.fn();
      client = { rpc: rpcMock } as unknown as SupabaseClient<Database>;
    });

    it("calls the RPC with snake_case args and maps the jsonb result", async () => {
      rpcMock.mockResolvedValue({
        data: {
          created_record_count: 2,
          skipped_record_count: 1,
          created_participants: { "新しい人": "part-new-1" },
        },
        error: null,
      });

      const result = await importRecordsAtomic(client, {
        conversationId: "conv-1",
        newParticipants: [{ name: "新しい人" }],
        records: [
          {
            participantId: "part-1",
            participantName: null,
            recordType: "text",
            title: null,
            content: "こんにちは",
            hasAudio: false,
            postedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            participantId: null,
            participantName: "新しい人",
            recordType: "video",
            title: null,
            content: null,
            hasAudio: true,
            postedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      });

      expect(rpcMock).toHaveBeenCalledWith("import_records_atomic", {
        p_conversation_id: "conv-1",
        p_new_participants: [{ name: "新しい人" }],
        p_records: [
          {
            participant_id: "part-1",
            participant_name: null,
            record_type: "text",
            title: null,
            content: "こんにちは",
            has_audio: false,
            posted_at: "2026-01-01T00:00:00.000Z",
          },
          {
            participant_id: null,
            participant_name: "新しい人",
            record_type: "video",
            title: null,
            content: null,
            has_audio: true,
            posted_at: "2026-01-02T00:00:00.000Z",
          },
        ],
      });
      expect(result).toEqual({
        createdRecordCount: 2,
        skippedRecordCount: 1,
        createdParticipants: { "新しい人": "part-new-1" },
      });
    });

    it("throws on error", async () => {
      const dbError = { message: "DB error", code: "42000" };
      rpcMock.mockResolvedValue({ data: null, error: dbError });

      await expect(
        importRecordsAtomic(client, {
          conversationId: "conv-1",
          newParticipants: [],
          records: [],
        }),
      ).rejects.toEqual(dbError);
    });
  });
});
