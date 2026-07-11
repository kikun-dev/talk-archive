import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ConversationParticipant } from "@/types/domain";
import type { ImportDedupCandidate } from "@/repositories/importRepository";
import {
  parseTalkImportJson,
  buildRecordDedupKey,
  buildImportPreview,
  executeImport,
  ImportError,
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_RECORD_COUNT,
  type TalkImportRecord,
  type TalkImportParseResult,
} from "./importUseCases";

vi.mock("@/repositories/conversationParticipantRepository");
vi.mock("@/repositories/importRepository");

import { getConversationParticipants } from "@/repositories/conversationParticipantRepository";
import {
  getImportDedupCandidates,
  importRecordsAtomic,
} from "@/repositories/importRepository";

const mockGetConversationParticipants = vi.mocked(getConversationParticipants);
const mockGetImportDedupCandidates = vi.mocked(getImportDedupCandidates);
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

function dedupCandidate(
  overrides: Partial<ImportDedupCandidate> = {},
): ImportDedupCandidate {
  return {
    participantId: "part-1",
    postedAt: "2026-07-07T06:19:00.000Z",
    recordType: "text",
    contentPrefix: "こんにちは",
    ...overrides,
  };
}

describe("importUseCases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports the size and record count limits", () => {
    expect(MAX_IMPORT_FILE_SIZE).toBe(5 * 1024 * 1024);
    expect(MAX_IMPORT_RECORD_COUNT).toBe(5000);
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
      expect(result.totalCount).toBe(2);
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

    it("accepts a speaker name of exactly 100 characters after trimming", () => {
      const speaker = "あ".repeat(100);
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: ` ${speaker} `,
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);

      expect(result.rowErrors).toEqual([]);
      expect(result.records[0].speaker).toBe(speaker);
    });

    it("collects a row error for a speaker name over 100 characters", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "あ".repeat(101),
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);

      expect(result.records).toEqual([]);
      expect(result.rowErrors).toEqual([
        "1件目: 発言者は100文字以内で入力してください",
      ]);
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

    it("collects a row error for an invalid calendar date (Feb 30)", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-02-30T12:00:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.records).toEqual([]);
      expect(result.rowErrors).toEqual(["1件目: 投稿日時が不正です"]);
    });

    it("collects a row error for Feb 29 in a non-leap year", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-02-29T12:00:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual(["1件目: 投稿日時が不正です"]);
    });

    it("accepts Feb 29 in a leap year", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2028-02-29T12:00:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual([]);
      expect(result.records).toHaveLength(1);
    });

    it("collects a row error for hour 24", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T24:00:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual(["1件目: 投稿日時が不正です"]);
    });

    it("collects a row error for a space-separated datetime", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-01-01 12:00:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual(["1件目: 投稿日時が不正です"]);
    });

    it("collects a row error for an English month name datetime", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "March 1 2026 12:00:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.rowErrors).toEqual(["1件目: 投稿日時が不正です"]);
    });

    it("collects a row error for an out-of-range offset (+15:00)", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+15:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);
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
      // totalCount は行エラーを含む入力全体の件数（#124）
      expect(result.totalCount).toBe(2);
    });

    function buildRecordsPayload(count: number): string {
      return JSON.stringify({
        version: 1,
        records: Array.from({ length: count }, (_, index) => ({
          speaker: "瀬戸口 心月",
          postedAt: "2026-07-07T15:19:00+09:00",
          type: "text",
          content: `本文${index}`,
        })),
      });
    }

    it("accepts exactly MAX_IMPORT_RECORD_COUNT records", () => {
      const json = buildRecordsPayload(MAX_IMPORT_RECORD_COUNT);
      const result = parseTalkImportJson(json);
      expect(result.records).toHaveLength(MAX_IMPORT_RECORD_COUNT);
      expect(result.totalCount).toBe(MAX_IMPORT_RECORD_COUNT);
    });

    it("throws ImportError when records exceed MAX_IMPORT_RECORD_COUNT", () => {
      const json = buildRecordsPayload(MAX_IMPORT_RECORD_COUNT + 1);
      expect(() => parseTalkImportJson(json)).toThrow(
        "一度に取り込めるのは5000件までです。ファイルを分割してください",
      );
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
    function parseResult(
      records: TalkImportRecord[],
      overrides: Partial<Pick<TalkImportParseResult, "totalCount" | "rowErrors">> = {},
    ): TalkImportParseResult {
      return {
        records,
        defaultYear: null,
        rowErrors: overrides.rowErrors ?? [],
        totalCount: overrides.totalCount ?? records.length,
      };
    }

    it("computes counts, period, type breakdown, and unknown speakers", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetImportDedupCandidates.mockResolvedValue([]);

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

      const preview = await buildImportPreview(
        client,
        "conv-1",
        parseResult(records),
      );

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
      mockGetImportDedupCandidates.mockResolvedValue([
        dedupCandidate({
          participantId: "part-1",
          postedAt: "2026-07-07T06:19:00.000Z",
          recordType: "text",
          contentPrefix: "こんにちは",
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

      const preview = await buildImportPreview(
        client,
        "conv-1",
        parseResult(records),
      );

      expect(preview.duplicateCount).toBe(1);
      expect(preview.importableCount).toBe(0);
    });

    it("counts duplicates within the JSON itself, keeping the first occurrence importable", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetImportDedupCandidates.mockResolvedValue([]);

      const record: TalkImportRecord = {
        speaker: "瀬戸口 心月",
        postedAt: "2026-07-07T06:19:00.000Z",
        type: "text",
        title: null,
        content: "こんにちは",
        hasAudio: false,
      };

      const preview = await buildImportPreview(
        client,
        "conv-1",
        parseResult([record, { ...record }]),
      );

      expect(preview.totalCount).toBe(2);
      expect(preview.duplicateCount).toBe(1);
      expect(preview.importableCount).toBe(1);
    });

    it("returns null period when there are no records", async () => {
      mockGetConversationParticipants.mockResolvedValue([]);
      mockGetImportDedupCandidates.mockResolvedValue([]);

      const preview = await buildImportPreview(client, "conv-1", parseResult([]));

      expect(preview.period).toBeNull();
      expect(preview.totalCount).toBe(0);
    });

    it("uses the parse result's totalCount (including row-errored records), not records.length (#124)", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockGetImportDedupCandidates.mockResolvedValue([]);

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

      // 入力全体は3件だが、行エラーで1件が除外され records には2件しか残っていない想定
      const preview = await buildImportPreview(
        client,
        "conv-1",
        parseResult(records, { totalCount: 3, rowErrors: ["2件目: エラー"] }),
      );

      expect(preview.totalCount).toBe(3);
      expect(preview.importableCount).toBe(1);
      expect(preview.duplicateCount).toBe(0);
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

      const result = await executeImport(client, "conv-1", {
        records: [],
        speakerAssignments: {},
      });

      expect(result).toEqual({
        createdCount: 0,
        skippedCount: 0,
        createdParticipants: {},
        createdRecords: [],
      });
      expect(mockImportRecordsAtomic).not.toHaveBeenCalled();
    });

    it("does not fetch existing records; duplicate detection against existing rows is delegated to the RPC's row lock (#124)", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 0,
        skippedRecordCount: 1,
        createdParticipants: {},
      });

      const result = await executeImport(client, "conv-1", {
        records: [validRecord],
        speakerAssignments: {},
      });

      expect(mockGetImportDedupCandidates).not.toHaveBeenCalled();
      expect(mockImportRecordsAtomic).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        createdCount: 0,
        skippedCount: 1,
        createdParticipants: {},
        createdRecords: [],
      });
    });

    it("combines the JSON-internal duplicate count with the RPC's skipped_record_count", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 1,
        skippedRecordCount: 2,
        createdParticipants: {},
      });

      const result = await executeImport(client, "conv-1", {
        // 1件は JSON 内部の重複（2件目は seen 済みキーとして除外される）
        records: [validRecord, { ...validRecord }],
        speakerAssignments: {},
      });

      expect(mockImportRecordsAtomic).toHaveBeenCalledTimes(1);
      const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
      expect(callArgs.records).toHaveLength(1);
      expect(result).toEqual({
        createdCount: 1,
        // JSON内部重複 1件 + RPC skipped 2件
        skippedCount: 3,
        createdParticipants: {},
        createdRecords: [],
      });
    });

    it("maps the RPC's createdRecordIds back to the sorted input records that produced them", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      // RPC index 1 はスキップされたので created_record_ids に含まれない前提
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 2,
        skippedRecordCount: 1,
        createdParticipants: {},
        createdRecordIds: [
          { index: 0, id: "record-a" },
          { index: 2, id: "record-c" },
        ],
      });

      const first: TalkImportRecord = {
        ...validRecord,
        postedAt: "2026-07-07T06:19:00.000Z",
        content: "1件目",
      };
      const second: TalkImportRecord = {
        ...validRecord,
        postedAt: "2026-07-08T06:19:00.000Z",
        content: "2件目",
      };
      const third: TalkImportRecord = {
        ...validRecord,
        postedAt: "2026-07-09T06:19:00.000Z",
        content: "3件目",
      };

      const result = await executeImport(client, "conv-1", {
        records: [first, second, third],
        speakerAssignments: {},
      });

      expect(result.createdRecords).toEqual([
        { record: first, id: "record-a" },
        { record: third, id: "record-c" },
      ]);
    });

    it("sorts records by postedAt ascending before calling the RPC and resolves existing participants", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 2,
        skippedRecordCount: 0,
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
      expect(result.skippedCount).toBe(0);
    });

    it("creates new participants for speakers assigned to 'new' and passes createdParticipants through", async () => {
      mockGetConversationParticipants.mockResolvedValue([]);
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 1,
        skippedRecordCount: 0,
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
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 1,
        skippedRecordCount: 0,
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

      await expect(
        executeImport(client, "conv-1", {
          records: [validRecord],
          speakerAssignments: { "瀬戸口 心月": "not-a-uuid" },
        }),
      ).rejects.toThrow(ImportError);
      expect(mockImportRecordsAtomic).not.toHaveBeenCalled();
    });

    describe("newParticipantNameBySpeaker (#128 レビュー対応)", () => {
      it("uses the mapped name suggestion for a newly created participant instead of the speaker itself", async () => {
        mockGetConversationParticipants.mockResolvedValue([]);
        mockImportRecordsAtomic.mockResolvedValue({
          createdRecordCount: 1,
          skippedRecordCount: 0,
          createdParticipants: { minami_umezawa: "part-new-1" },
        });

        const record: TalkImportRecord = {
          ...validRecord,
          speaker: "nogizaka46-minami_umezawa@example.com",
        };

        const result = await executeImport(client, "conv-1", {
          records: [record],
          speakerAssignments: { "nogizaka46-minami_umezawa@example.com": "new" },
          newParticipantNameBySpeaker: {
            "nogizaka46-minami_umezawa@example.com": "minami_umezawa",
          },
        });

        const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
        expect(callArgs.newParticipants).toEqual([{ name: "minami_umezawa" }]);
        expect(callArgs.records[0].participantName).toBe("minami_umezawa");
        expect(result.createdParticipants).toEqual({
          minami_umezawa: "part-new-1",
        });
      });

      it("merges two different speakers that map to the same candidate name into a single new participant", async () => {
        mockGetConversationParticipants.mockResolvedValue([]);
        mockImportRecordsAtomic.mockResolvedValue({
          createdRecordCount: 2,
          skippedRecordCount: 0,
          createdParticipants: { "太郎": "part-new-1" },
        });

        const first: TalkImportRecord = {
          ...validRecord,
          speaker: "alice@example.com",
          content: "1件目",
        };
        const second: TalkImportRecord = {
          ...validRecord,
          speaker: "bob@example.com",
          content: "2件目",
        };

        await executeImport(client, "conv-1", {
          records: [first, second],
          speakerAssignments: {
            "alice@example.com": "new",
            "bob@example.com": "new",
          },
          newParticipantNameBySpeaker: {
            "alice@example.com": "太郎",
            "bob@example.com": "太郎",
          },
        });

        const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
        // 2つの異なる speaker が同じ候補名を持つ場合、新規参加者は1件に統合される
        expect(callArgs.newParticipants).toEqual([{ name: "太郎" }]);
        expect(
          callArgs.records.every(
            (r: { participantName: string | null }) => r.participantName === "太郎",
          ),
        ).toBe(true);
      });

      it("trims and truncates a candidate name longer than MAX_PARTICIPANT_NAME_LENGTH (100 chars)", async () => {
        mockGetConversationParticipants.mockResolvedValue([]);
        mockImportRecordsAtomic.mockResolvedValue({
          createdRecordCount: 1,
          skippedRecordCount: 0,
          createdParticipants: {},
        });

        const longName = "あ".repeat(105);
        const expectedName = "あ".repeat(100);

        await executeImport(client, "conv-1", {
          records: [validRecord],
          speakerAssignments: { "瀬戸口 心月": "new" },
          newParticipantNameBySpeaker: { "瀬戸口 心月": `  ${longName}  ` },
        });

        const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
        expect(callArgs.newParticipants).toEqual([{ name: expectedName }]);
        expect(callArgs.records[0].participantName).toBe(expectedName);
      });

      it("falls back to the speaker itself when the speaker has no entry in newParticipantNameBySpeaker", async () => {
        mockGetConversationParticipants.mockResolvedValue([]);
        mockImportRecordsAtomic.mockResolvedValue({
          createdRecordCount: 1,
          skippedRecordCount: 0,
          createdParticipants: {},
        });

        await executeImport(client, "conv-1", {
          records: [validRecord],
          speakerAssignments: { "瀬戸口 心月": "new" },
          newParticipantNameBySpeaker: { "別の人": "別の候補名" },
        });

        const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
        expect(callArgs.newParticipants).toEqual([{ name: "瀬戸口 心月" }]);
        expect(callArgs.records[0].participantName).toBe("瀬戸口 心月");
      });

      it("falls back to the speaker itself when the mapped candidate name is blank after trimming", async () => {
        mockGetConversationParticipants.mockResolvedValue([]);
        mockImportRecordsAtomic.mockResolvedValue({
          createdRecordCount: 1,
          skippedRecordCount: 0,
          createdParticipants: {},
        });

        await executeImport(client, "conv-1", {
          records: [validRecord],
          speakerAssignments: { "瀬戸口 心月": "new" },
          newParticipantNameBySpeaker: { "瀬戸口 心月": "   " },
        });

        const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
        expect(callArgs.newParticipants).toEqual([{ name: "瀬戸口 心月" }]);
        expect(callArgs.records[0].participantName).toBe("瀬戸口 心月");
      });

      it("does not affect the JSON import path when newParticipantNameBySpeaker is omitted (regression)", async () => {
        mockGetConversationParticipants.mockResolvedValue([]);
        mockImportRecordsAtomic.mockResolvedValue({
          createdRecordCount: 1,
          skippedRecordCount: 0,
          createdParticipants: { "新しい人": "part-new-1" },
        });

        const record: TalkImportRecord = { ...validRecord, speaker: "新しい人" };

        const result = await executeImport(client, "conv-1", {
          records: [record],
          speakerAssignments: { "新しい人": "new" },
        });

        const callArgs = mockImportRecordsAtomic.mock.calls[0][1];
        expect(callArgs.newParticipants).toEqual([{ name: "新しい人" }]);
        expect(callArgs.records[0].participantName).toBe("新しい人");
        expect(result.createdParticipants).toEqual({ "新しい人": "part-new-1" });
      });
    });
  });
});
