import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ConversationParticipant, Record as DomainRecord } from "@/types/domain";
import {
  parseTalkImportJson,
  buildRecordDedupKey,
  buildImportPreview,
  executeImport,
  ImportError,
  type TalkImportRecord,
} from "./importUseCases";

vi.mock("@/repositories/conversationParticipantRepository");
vi.mock("@/repositories/recordRepository");
vi.mock("@/repositories/importRepository");

import { getConversationParticipants } from "@/repositories/conversationParticipantRepository";
import { getRecordsByConversation } from "@/repositories/recordRepository";
import { importRecordsAtomic } from "@/repositories/importRepository";

const mockGetConversationParticipants = vi.mocked(getConversationParticipants);
const mockGetRecordsByConversation = vi.mocked(getRecordsByConversation);
const mockImportRecordsAtomic = vi.mocked(importRecordsAtomic);

const client = {} as SupabaseClient<Database>;

function participant(
  overrides: Partial<ConversationParticipant> = {},
): ConversationParticipant {
  return {
    id: "part-1",
    conversationId: "conv-1",
    name: "瀬戸口 心月",
    sortOrder: 0,
    thumbnailPath: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function domainRecord(overrides: Partial<DomainRecord> = {}): DomainRecord {
  return {
    id: "rec-1",
    conversationId: "conv-1",
    recordType: "text",
    title: null,
    content: "こんにちは",
    hasAudio: false,
    speakerParticipantId: "part-1",
    postedAt: "2026-07-07T06:19:00.000Z",
    position: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("importUseCases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("parseTalkImportJson", () => {
    it("parses a valid JSON payload", () => {
      const json = JSON.stringify({
        version: 1,
        defaultYear: 2026,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "こんにちは",
            title: null,
          },
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-08T20:31:00+09:00",
            type: "video",
            content: null,
            hasAudio: true,
          },
        ],
      });

      const result = parseTalkImportJson(json);

      expect(result.rowErrors).toEqual([]);
      expect(result.defaultYear).toBe(2026);
      expect(result.records).toHaveLength(2);
      expect(result.records[0]).toEqual({
        speaker: "瀬戸口 心月",
        postedAt: new Date("2026-07-07T15:19:00+09:00").toISOString(),
        type: "text",
        title: null,
        content: "こんにちは",
        hasAudio: false,
      });
      expect(result.records[1]).toEqual({
        speaker: "瀬戸口 心月",
        postedAt: new Date("2026-07-08T20:31:00+09:00").toISOString(),
        type: "video",
        title: null,
        content: null,
        hasAudio: true,
      });
    });

    it("throws ImportError on invalid JSON", () => {
      expect(() => parseTalkImportJson("not json")).toThrow(ImportError);
    });

    it("throws ImportError when version is not 1", () => {
      const json = JSON.stringify({ version: 2, records: [] });
      expect(() => parseTalkImportJson(json)).toThrow("対応していないバージョンです");
    });

    it("throws ImportError when version is missing", () => {
      const json = JSON.stringify({ records: [] });
      expect(() => parseTalkImportJson(json)).toThrow("対応していないバージョンです");
    });

    it("throws ImportError when records is missing", () => {
      const json = JSON.stringify({ version: 1 });
      expect(() => parseTalkImportJson(json)).toThrow(ImportError);
    });

    it("collects a row error for empty speaker and skips the record", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "  ",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.records).toEqual([]);
      expect(result.rowErrors).toEqual(["1件目: 発言者を入力してください"]);
    });

    it("collects a row error for invalid postedAt (no timezone)", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.records).toEqual([]);
      expect(result.rowErrors).toEqual(["1件目: 投稿日時が不正です"]);
    });

    it("collects a row error for an unparsable postedAt", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "not-a-date",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual(["1件目: 投稿日時が不正です"]);
    });

    it("collects a row error for an invalid type", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "sticker",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual(["1件目: 種別が不正です"]);
    });

    it("collects a row error for text records with empty content", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "   ",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual(["1件目: テキストを入力してください"]);
    });

    it("allows media records with null content", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "image",
            content: null,
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual([]);
      expect(result.records).toHaveLength(1);
    });

    it("collects a row error for a title over 200 characters", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "こんにちは",
            title: "あ".repeat(201),
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual([
        "1件目: タイトルは200文字以内で入力してください",
      ]);
    });

    it("keeps valid records while collecting errors for invalid ones, with correct 1-based index", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "OK",
          },
          {
            speaker: "",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "NG",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.records).toHaveLength(1);
      expect(result.records[0].content).toBe("OK");
      expect(result.rowErrors).toEqual(["2件目: 発言者を入力してください"]);
    });
  });

  describe("buildRecordDedupKey", () => {
    it("normalizes postedAt to ISO and trims/truncates content to 20 chars", () => {
      const longContent = "あ".repeat(30);
      const key = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "text",
        `  ${longContent}  `,
      );

      expect(key).toBe(
        `part-1|${new Date("2026-07-07T15:19:00+09:00").toISOString()}|text|${longContent.slice(0, 20)}`,
      );
    });

    it("treats null content as empty string", () => {
      const key = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "video",
        null,
      );

      expect(key).toBe(
        `part-1|${new Date("2026-07-07T15:19:00+09:00").toISOString()}|video|`,
      );
    });

    it("produces the same key for postedAt strings that normalize to the same instant", () => {
      const keyA = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "text",
        "hello",
      );
      const keyB = buildRecordDedupKey(
        "part-1",
        new Date("2026-07-07T15:19:00+09:00").toISOString(),
        "text",
        "hello",
      );

      expect(keyA).toBe(keyB);
    });
  });

  describe("buildImportPreview", () => {
    it("computes counts, period, type breakdown, and unknown speakers", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetRecordsByConversation.mockResolvedValue([]);

      const records: TalkImportRecord[] = [
        {
          speaker: "瀬戸口 心月",
          postedAt: "2026-07-07T06:19:00.000Z",
          type: "text",
          title: null,
          content: "こんにちは",
          hasAudio: false,
        },
        {
          speaker: "未知の人",
          postedAt: "2026-07-08T11:31:00.000Z",
          type: "video",
          title: null,
          content: null,
          hasAudio: true,
        },
      ];

      const preview = await buildImportPreview(client, "conv-1", records);

      expect(preview.totalCount).toBe(2);
      expect(preview.importableCount).toBe(2);
      expect(preview.duplicateCount).toBe(0);
      expect(preview.unknownSpeakers).toEqual(["未知の人"]);
      expect(preview.typeCounts).toEqual({
        text: 1,
        image: 0,
        video: 1,
        audio: 0,
      });
      expect(preview.period).toEqual({
        start: "2026-07-07T06:19:00.000Z",
        end: "2026-07-08T11:31:00.000Z",
      });
    });

    it("counts duplicates against existing records", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetRecordsByConversation.mockResolvedValue([
        domainRecord({
          speakerParticipantId: "part-1",
          postedAt: "2026-07-07T06:19:00.000Z",
          recordType: "text",
          content: "こんにちは",
        }),
      ]);

      const records: TalkImportRecord[] = [
        {
          speaker: "瀬戸口 心月",
          postedAt: "2026-07-07T06:19:00.000Z",
          type: "text",
          title: null,
          content: "こんにちは",
          hasAudio: false,
        },
      ];

      const preview = await buildImportPreview(client, "conv-1", records);

      expect(preview.duplicateCount).toBe(1);
      expect(preview.importableCount).toBe(0);
    });

    it("counts duplicates within the JSON itself, keeping the first occurrence importable", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetRecordsByConversation.mockResolvedValue([]);

      const record: TalkImportRecord = {
        speaker: "瀬戸口 心月",
        postedAt: "2026-07-07T06:19:00.000Z",
        type: "text",
        title: null,
        content: "こんにちは",
        hasAudio: false,
      };

      const preview = await buildImportPreview(client, "conv-1", [
        record,
        { ...record },
      ]);

      expect(preview.totalCount).toBe(2);
      expect(preview.duplicateCount).toBe(1);
      expect(preview.importableCount).toBe(1);
    });

    it("returns null period when there are no records", async () => {
      mockGetConversationParticipants.mockResolvedValue([]);
      mockGetRecordsByConversation.mockResolvedValue([]);

      const preview = await buildImportPreview(client, "conv-1", []);

      expect(preview.period).toBeNull();
      expect(preview.totalCount).toBe(0);
    });
  });

  describe("executeImport", () => {
    const validRecord: TalkImportRecord = {
      speaker: "瀬戸口 心月",
      postedAt: "2026-07-07T06:19:00.000Z",
      type: "text",
      title: null,
      content: "こんにちは",
      hasAudio: false,
    };

    it("throws ImportError when a speaker cannot be resolved", async () => {
      mockGetConversationParticipants.mockResolvedValue([]);
      mockGetRecordsByConversation.mockResolvedValue([]);

      await expect(
        executeImport(client, "conv-1", {
          records: [validRecord],
          speakerAssignments: {},
        }),
      ).rejects.toThrow(ImportError);

      expect(mockImportRecordsAtomic).not.toHaveBeenCalled();
    });

    it("does not call the RPC when there is nothing importable (0 records)", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetRecordsByConversation.mockResolvedValue([]);

      const result = await executeImport(client, "conv-1", {
        records: [],
        speakerAssignments: {},
      });

      expect(result).toEqual({
        createdCount: 0,
        skippedCount: 0,
        createdParticipants: {},
      });
      expect(mockImportRecordsAtomic).not.toHaveBeenCalled();
    });

    it("skips duplicates against existing records and does not call RPC when all are duplicates", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetRecordsByConversation.mockResolvedValue([
        domainRecord({
          speakerParticipantId: "part-1",
          postedAt: "2026-07-07T06:19:00.000Z",
          recordType: "text",
          content: "こんにちは",
        }),
      ]);

      const result = await executeImport(client, "conv-1", {
        records: [validRecord],
        speakerAssignments: {},
      });

      expect(result).toEqual({
        createdCount: 0,
        skippedCount: 1,
        createdParticipants: {},
      });
      expect(mockImportRecordsAtomic).not.toHaveBeenCalled();
    });

    it("sorts records by postedAt ascending before calling the RPC and resolves existing participants", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetRecordsByConversation.mockResolvedValue([]);
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 2,
        createdParticipants: {},
      });

      const earlier: TalkImportRecord = {
        ...validRecord,
        postedAt: "2026-07-07T06:19:00.000Z",
        content: "先",
      };
      const later: TalkImportRecord = {
        ...validRecord,
        postedAt: "2026-07-08T06:19:00.000Z",
        content: "後",
      };

      const result = await executeImport(client, "conv-1", {
        // 入力は降順で渡すが、RPCへは昇順で渡されるはず
        records: [later, earlier],
        speakerAssignments: {},
      });

      expect(mockImportRecordsAtomic).toHaveBeenCalledTimes(1);
      const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
      expect(callArgs.records.map((r) => r.content)).toEqual(["先", "後"]);
      expect(callArgs.records.every((r) => r.participantId === "part-1")).toBe(
        true,
      );
      expect(callArgs.newParticipants).toEqual([]);
      expect(result.createdCount).toBe(2);
    });

    it("creates new participants for speakers assigned to 'new' and passes createdParticipants through", async () => {
      mockGetConversationParticipants.mockResolvedValue([]);
      mockGetRecordsByConversation.mockResolvedValue([]);
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 1,
        createdParticipants: { "新しい人": "part-new-1" },
      });

      const record: TalkImportRecord = {
        ...validRecord,
        speaker: "新しい人",
      };

      const result = await executeImport(client, "conv-1", {
        records: [record],
        speakerAssignments: { "新しい人": "new" },
      });

      expect(mockImportRecordsAtomic).toHaveBeenCalledTimes(1);
      const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
      expect(callArgs.newParticipants).toEqual([{ name: "新しい人" }]);
      expect(callArgs.records[0].participantId).toBeNull();
      expect(callArgs.records[0].participantName).toBe("新しい人");
      expect(result.createdParticipants).toEqual({ "新しい人": "part-new-1" });
    });

    it("resolves speakers assigned to an existing participant id explicitly", async () => {
      mockGetConversationParticipants.mockResolvedValue([]);
      mockGetRecordsByConversation.mockResolvedValue([]);
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 1,
        createdParticipants: {},
      });

      const existingParticipantId = "22222222-2222-2222-2222-222222222222";
      const result = await executeImport(client, "conv-1", {
        records: [validRecord],
        speakerAssignments: { "瀬戸口 心月": existingParticipantId },
      });

      const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
      expect(callArgs.records[0].participantId).toBe(existingParticipantId);
      expect(callArgs.newParticipants).toEqual([]);
      expect(result.createdCount).toBe(1);
    });

    it("throws ImportError when an explicit assignment is not 'new' or a valid participant id", async () => {
      mockGetConversationParticipants.mockResolvedValue([]);
      mockGetRecordsByConversation.mockResolvedValue([]);

      await expect(
        executeImport(client, "conv-1", {
          records: [validRecord],
          speakerAssignments: { "瀬戸口 心月": "not-a-uuid" },
        }),
      ).rejects.toThrow(ImportError);
      expect(mockImportRecordsAtomic).not.toHaveBeenCalled();
    });
  });
});
