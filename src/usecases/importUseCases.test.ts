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
            importKey: null,
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
        importKey: null,
      });
      expect(result.records[1]).toEqual({
        speaker: "瀬戸口 心月",
        postedAt: new Date("2026-07-08T20:31:00+09:00").toISOString(),
        type: "video",
        title: null,
        content: null,
        hasAudio: true,
        importKey: null,
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

    // #128 第4ラウンドレビュー対応（P1）: 未知 speaker は UI 既定値 "new" で
    // p_new_participants[].name / participant_name に入るため、content / title と
    // 同様に PostgreSQL の jsonb/text カラムが保存できない U+0000（NUL）を行エラーとして
    // 検知し、正常な行を含むバッチ全体が失敗するのを防ぐ
    it("collects a row error when speaker contains U+0000 (NUL), which PostgreSQL's jsonb/text columns cannot store", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: `瀬戸口${String.fromCharCode(0)}心月`,
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });

      const result = parseTalkImportJson(json);

      expect(result.records).toEqual([]);
      expect(result.rowErrors).toEqual([
        "1件目: 発言者名に使用できない文字（U+0000）が含まれています",
      ]);
    });

    it("skips only the record whose speaker contains U+0000 and keeps importing the other valid records", () => {
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
            speaker: `NG${String.fromCharCode(0)}`,
            postedAt: "2026-07-08T15:19:00+09:00",
            type: "text",
            content: "NG",
          },
        ],
      });

      const result = parseTalkImportJson(json);

      expect(result.records).toHaveLength(1);
      expect(result.records[0].speaker).toBe("瀬戸口 心月");
      expect(result.rowErrors).toEqual([
        "2件目: 発言者名に使用できない文字（U+0000）が含まれています",
      ]);
      expect(result.totalCount).toBe(2);
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

    // #128 第3ラウンドレビュー対応（P1）: PostgreSQL の jsonb/text カラムは U+0000（NUL）
    // を保存できず import_records_atomic RPC でバッチ全体が失敗するため、JSON インポート
    // 経路では黙って除去せず行エラーとして表面化させる（JSON は talk-extract スキルの
    // 機械生成であり、混入は入力側の異常として検知したい）
    it("collects a row error when content contains U+0000 (NUL), which PostgreSQL's jsonb/text columns cannot store", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: `前${String.fromCharCode(0)}後`,
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.records).toEqual([]);
      expect(result.rowErrors).toEqual([
        "1件目: 本文に使用できない文字（U+0000）が含まれています",
      ]);
    });

    it("collects a row error when title contains U+0000 (NUL)", () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "こんにちは",
            title: `前${String.fromCharCode(0)}後`,
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.records).toEqual([]);
      expect(result.rowErrors).toEqual([
        "1件目: タイトルに使用できない文字（U+0000）が含まれています",
      ]);
    });

    it("skips only the record whose content contains U+0000 and keeps importing the other valid records", () => {
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
            speaker: "瀬戸口 心月",
            postedAt: "2026-07-08T15:19:00+09:00",
            type: "text",
            content: `NG${String.fromCharCode(0)}`,
          },
        ],
      });

      const result = parseTalkImportJson(json);
      expect(result.records).toHaveLength(1);
      expect(result.records[0].content).toBe("OK");
      expect(result.rowErrors).toEqual([
        "2件目: 本文に使用できない文字（U+0000）が含まれています",
      ]);
      expect(result.totalCount).toBe(2);
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

    // #133: .eml インポートは同一メール（同一 participant + postedAt + type）から
    // 複数レコード（メイン+追加画像）を作るため、本文プレフィックスだけでは
    // 区別できないケースがある。importKey が指定された場合はそれを名前空間化した
    // キーとして使い、participant/postedAt/type/content の組み合わせに関わらず一意にする
    it("returns a namespaced key based solely on importKey when importKey is a non-null string, ignoring other fields", () => {
      const key = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "text",
        "hello",
        "mail.eml#0",
      );

      expect(key).toBe("key:mail.eml#0");
    });

    it("falls back to the content-based key when importKey is null", () => {
      const withNull = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "text",
        "hello",
        null,
      );
      const withoutArg = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "text",
        "hello",
      );

      expect(withNull).toBe(withoutArg);
    });

    it("treats two records with distinct importKeys as different even with identical participant/postedAt/type/content", () => {
      const keyA = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "image",
        null,
        "mail.eml#0",
      );
      const keyB = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "image",
        null,
        "mail.eml#1",
      );

      expect(keyA).not.toBe(keyB);
    });

    it("treats two records with the same importKey as duplicates", () => {
      const keyA = buildRecordDedupKey(
        "part-1",
        "2026-07-07T15:19:00+09:00",
        "image",
        null,
        "mail.eml#0",
      );
      const keyB = buildRecordDedupKey(
        "part-2",
        "2026-08-01T00:00:00+09:00",
        "text",
        "違う内容",
        "mail.eml#0",
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
          importKey: null,
        },
        {
          speaker: "未知の人",
          postedAt: "2026-07-08T11:31:00.000Z",
          type: "video",
          title: null,
          content: null,
          hasAudio: true,
          importKey: null,
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
          importKey: null,
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
        importKey: null,
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
          importKey: null,
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
      importKey: null,
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
      const existingParticipantId = "22222222-2222-2222-2222-222222222222";
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: existingParticipantId, name: "他の参加者" }),
      ]);
      mockImportRecordsAtomic.mockResolvedValue({
        createdRecordCount: 1,
        skippedRecordCount: 0,
        createdParticipants: {},
      });

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

    // #128 レビュー対応（P1）: participantId が UUID 形式でも、このトークの参加者
    // 集合に含まれなければ不正として弾く（別トーク・存在しない participantId 対策）
    it("throws ImportError when the assigned participant id is a valid UUID but does not belong to this conversation (e.g. another conversation's participant)", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);

      const otherConversationParticipantId = "33333333-3333-3333-3333-333333333333";
      await expect(
        executeImport(client, "conv-1", {
          records: [validRecord],
          speakerAssignments: {
            "瀬戸口 心月": otherConversationParticipantId,
          },
        }),
      ).rejects.toThrow('発言者「瀬戸口 心月」の割り当てが不正です');
      expect(mockImportRecordsAtomic).not.toHaveBeenCalled();
    });

    it("throws ImportError when the assigned participant id is a well-formed UUID that does not exist at all", async () => {
      mockGetConversationParticipants.mockResolvedValue([]);

      const nonExistentParticipantId = "44444444-4444-4444-4444-444444444444";
      await expect(
        executeImport(client, "conv-1", {
          records: [validRecord],
          speakerAssignments: { "瀬戸口 心月": nonExistentParticipantId },
        }),
      ).rejects.toThrow(ImportError);
      expect(mockImportRecordsAtomic).not.toHaveBeenCalled();
    });

    // #128 第4ラウンドレビュー対応（P1）: parseTalkImportJson が U+0000 を含む speaker を
    // 行エラーとして除外するため、そのようなレコードしかない JSON は records が空になり、
    // RPC（importRecordsAtomic）は呼ばれない
    it("does not call the RPC when the only records are ones whose speaker was excluded for containing U+0000 by parseTalkImportJson", async () => {
      const json = JSON.stringify({
        version: 1,
        records: [
          {
            speaker: `NG${String.fromCharCode(0)}`,
            postedAt: "2026-07-07T15:19:00+09:00",
            type: "text",
            content: "こんにちは",
          },
        ],
      });
      const parseResult = parseTalkImportJson(json);
      expect(parseResult.records).toEqual([]);

      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: "part-1", name: "瀬戸口 心月" }),
      ]);

      const result = await executeImport(client, "conv-1", {
        records: parseResult.records,
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
  });

  describe("buildImportPreview with speakerAssignments (options, #128 レビュー対応 P1)", () => {
    const PART_1 = "11111111-1111-1111-1111-111111111111";
    const PART_2 = "22222222-2222-2222-2222-222222222222";

    function parseResult(records: TalkImportRecord[]): TalkImportParseResult {
      return {
        records,
        defaultYear: null,
        rowErrors: [],
        totalCount: records.length,
      };
    }

    it("counts a duplicate against an existing record for the assigned participant, matching what executeImport would do", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: PART_1, name: "瀬戸口 心月" }),
      ]);
      mockGetImportDedupCandidates.mockResolvedValue([
        dedupCandidate({
          participantId: PART_1,
          postedAt: "2026-07-07T06:19:00.000Z",
          recordType: "text",
          contentPrefix: "こんにちは",
        }),
      ]);

      // eml のレコードは speaker に From アドレスがそのまま入る（未知 speaker 扱い）
      const records: TalkImportRecord[] = [
        {
          speaker: "sender@example.com",
          postedAt: "2026-07-07T06:19:00.000Z",
          type: "text",
          title: null,
          content: "こんにちは",
          hasAudio: false,
          importKey: null,
        },
      ];

      const preview = await buildImportPreview(
        client,
        "conv-1",
        parseResult(records),
        { speakerAssignments: { "sender@example.com": PART_1 } },
      );

      expect(preview.duplicateCount).toBe(1);
      expect(preview.importableCount).toBe(0);
      expect(preview.unknownSpeakers).toEqual([]);
    });

    it("counts records from different From addresses assigned to the same participant as duplicates of each other when content matches, matching executeImport's resolution", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: PART_1, name: "瀬戸口 心月" }),
      ]);
      mockGetImportDedupCandidates.mockResolvedValue([]);

      const records: TalkImportRecord[] = [
        {
          speaker: "alice@example.com",
          postedAt: "2026-07-07T06:19:00.000Z",
          type: "text",
          title: null,
          content: "こんにちは",
          hasAudio: false,
          importKey: null,
        },
        {
          speaker: "bob@example.com",
          postedAt: "2026-07-07T06:19:00.000Z",
          type: "text",
          title: null,
          content: "こんにちは",
          hasAudio: false,
          importKey: null,
        },
      ];

      const preview = await buildImportPreview(
        client,
        "conv-1",
        parseResult(records),
        {
          speakerAssignments: {
            "alice@example.com": PART_1,
            "bob@example.com": PART_1,
          },
        },
      );

      expect(preview.totalCount).toBe(2);
      expect(preview.duplicateCount).toBe(1);
      expect(preview.importableCount).toBe(1);
      expect(preview.unknownSpeakers).toEqual([]);
    });

    it("does not treat an assigned speaker as unknown, but keeps counting speakers without an assignment or existing participant as unknown", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: PART_1, name: "瀬戸口 心月" }),
      ]);
      mockGetImportDedupCandidates.mockResolvedValue([]);

      const records: TalkImportRecord[] = [
        {
          speaker: "assigned@example.com",
          postedAt: "2026-07-07T06:19:00.000Z",
          type: "text",
          title: null,
          content: "A",
          hasAudio: false,
          importKey: null,
        },
        {
          speaker: "not-assigned@example.com",
          postedAt: "2026-07-08T06:19:00.000Z",
          type: "text",
          title: null,
          content: "B",
          hasAudio: false,
          importKey: null,
        },
      ];

      const preview = await buildImportPreview(
        client,
        "conv-1",
        parseResult(records),
        { speakerAssignments: { "assigned@example.com": PART_1 } },
      );

      expect(preview.unknownSpeakers).toEqual(["not-assigned@example.com"]);
    });

    it("throws ImportError when an assignment references a participant id that does not belong to this conversation (mirrors executeImport's validation, #128)", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: PART_1, name: "瀬戸口 心月" }),
      ]);
      mockGetImportDedupCandidates.mockResolvedValue([]);

      const records: TalkImportRecord[] = [
        {
          speaker: "sender@example.com",
          postedAt: "2026-07-07T06:19:00.000Z",
          type: "text",
          title: null,
          content: "こんにちは",
          hasAudio: false,
          importKey: null,
        },
      ];

      await expect(
        buildImportPreview(client, "conv-1", parseResult(records), {
          speakerAssignments: { "sender@example.com": PART_2 },
        }),
      ).rejects.toThrow('発言者「sender@example.com」の割り当てが不正です');
    });

    it("leaves the JSON import path (no options argument) unaffected — regression check", async () => {
      mockGetConversationParticipants.mockResolvedValue([
        participant({ id: PART_1, name: "瀬戸口 心月" }),
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
          importKey: null,
        },
      ];

      const preview = await buildImportPreview(
        client,
        "conv-1",
        parseResult(records),
      );

      expect(preview.duplicateCount).toBe(0);
      expect(preview.importableCount).toBe(1);
      expect(preview.unknownSpeakers).toEqual([]);
    });
  });
});
