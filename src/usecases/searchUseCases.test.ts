import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SearchRecordResult } from "@/types/domain";
import {
  searchRecords,
  sanitizeSearchQuery,
} from "./searchUseCases";

vi.mock("@/repositories/recordRepository");

import { searchRecords as searchRecordsInRepository } from "@/repositories/recordRepository";

const mockSearchRecordsInRepository = vi.mocked(searchRecordsInRepository);

const client = {} as SupabaseClient<Database>;

const baseSearchResult: SearchRecordResult = {
  id: "rec-1",
  conversationId: "conv-1",
  conversationTitle: "会話タイトル",
  recordType: "text",
  title: "タイトル",
  content: "テスト内容",
  hasAudio: false,
  speakerParticipantId: "11111111-1111-1111-1111-111111111111",
  postedAt: "2026-01-01T12:00:00Z",
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("searchUseCases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("sanitizeSearchQuery", () => {
    it("trims surrounding whitespace", () => {
      expect(sanitizeSearchQuery("  テスト  ")).toBe("テスト");
    });

    it("collapses consecutive whitespace", () => {
      expect(sanitizeSearchQuery("テスト   キーワード")).toBe(
        "テスト キーワード",
      );
    });

    it("escapes LIKE wildcards and backslashes", () => {
      expect(sanitizeSearchQuery(String.raw`100%_test\sample`)).toBe(
        String.raw`100\%\_test\\sample`,
      );
    });
  });

  describe("searchRecords", () => {
    it("returns empty array for blank query without calling repository", async () => {
      const result = await searchRecords(client, {
        userId: "user-1",
        query: "   ",
      });

      expect(result).toEqual([]);
      expect(mockSearchRecordsInRepository).not.toHaveBeenCalled();
    });

    it("searches with sanitized query", async () => {
      mockSearchRecordsInRepository.mockResolvedValue([baseSearchResult]);

      const result = await searchRecords(client, {
        userId: "user-1",
        query: "  100% テスト_  ",
      });

      expect(result).toEqual([baseSearchResult]);
      expect(mockSearchRecordsInRepository).toHaveBeenCalledWith(client, {
        userId: "user-1",
        query: String.raw`100\% テスト\_`,
        conversationId: undefined,
      });
    });

    it("passes conversationId when provided", async () => {
      mockSearchRecordsInRepository.mockResolvedValue([baseSearchResult]);

      await searchRecords(client, {
        userId: "user-1",
        query: "テスト",
        conversationId: " conv-1 ",
      });

      expect(mockSearchRecordsInRepository).toHaveBeenCalledWith(client, {
        userId: "user-1",
        query: "テスト",
        conversationId: "conv-1",
      });
    });
  });
});
