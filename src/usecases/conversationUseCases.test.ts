import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  Conversation,
  ConversationActivePeriod,
  Record,
} from "@/types/domain";
import {
  calculateConversationActiveDays,
  createNewConversation,
  deleteExistingConversation,
  getConversationWithRecords,
  listConversations,
  updateExistingConversation,
  validateConversationActivePeriods,
  validateCreateConversationInput,
  validateUpdateConversationInput,
} from "./conversationUseCases";

vi.mock("@/repositories/conversationRepository");
vi.mock("@/repositories/conversationActivePeriodRepository");
vi.mock("@/repositories/recordRepository");

import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversations,
  updateConversation,
} from "@/repositories/conversationRepository";
import {
  createConversationActivePeriods,
  getConversationActivePeriods,
  replaceConversationActivePeriods,
} from "@/repositories/conversationActivePeriodRepository";
import { getRecordsByConversation } from "@/repositories/recordRepository";

const mockGetConversations = vi.mocked(getConversations);
const mockGetConversation = vi.mocked(getConversation);
const mockCreateConversation = vi.mocked(createConversation);
const mockUpdateConversation = vi.mocked(updateConversation);
const mockDeleteConversation = vi.mocked(deleteConversation);
const mockCreateConversationActivePeriods = vi.mocked(
  createConversationActivePeriods,
);
const mockGetConversationActivePeriods = vi.mocked(
  getConversationActivePeriods,
);
const mockReplaceConversationActivePeriods = vi.mocked(
  replaceConversationActivePeriods,
);
const mockGetRecordsByConversation = vi.mocked(getRecordsByConversation);

const client = {} as SupabaseClient<Database>;

const baseConversation: Conversation = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  idolGroup: "nogizaka",
  coverImagePath: null,
  title: "テスト会話",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const activePeriods: ConversationActivePeriod[] = [
  {
    id: "period-1",
    conversationId: "conv-1",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const baseRecord: Record = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: null,
  content: "テスト内容",
  hasAudio: false,
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("conversationUseCases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("calculateConversationActiveDays", () => {
    it("counts a closed period inclusively", () => {
      expect(
        calculateConversationActiveDays([
          { startDate: "2026-01-01", endDate: "2026-01-10" },
        ]),
      ).toBe(10);
    });

    it("counts an ongoing period through today", () => {
      expect(
        calculateConversationActiveDays(
          [{ startDate: "2026-01-08", endDate: null }],
          new Date("2026-01-10T12:00:00+09:00"),
        ),
      ).toBe(3);
    });

    it("merges overlapping and contiguous periods", () => {
      expect(
        calculateConversationActiveDays([
          { startDate: "2026-01-01", endDate: "2026-01-05" },
          { startDate: "2026-01-04", endDate: "2026-01-08" },
          { startDate: "2026-01-09", endDate: "2026-01-10" },
        ]),
      ).toBe(10);
    });

    it("excludes gap days between periods", () => {
      expect(
        calculateConversationActiveDays([
          { startDate: "2026-01-01", endDate: "2026-01-03" },
          { startDate: "2026-01-05", endDate: "2026-01-06" },
        ]),
      ).toBe(5);
    });
  });

  describe("validateConversationActivePeriods", () => {
    it("accepts valid periods", () => {
      expect(
        validateConversationActivePeriods([
          { startDate: "2026-01-01", endDate: "2026-01-10" },
          { startDate: "2026-01-15", endDate: null },
        ]),
      ).toBeNull();
    });

    it("rejects empty periods", () => {
      expect(validateConversationActivePeriods([])).toBe(
        "会話期間を1件以上入力してください",
      );
    });

    it("rejects invalid date format", () => {
      expect(
        validateConversationActivePeriods([
          { startDate: "2026-13-01", endDate: null },
        ]),
      ).toBe("会話期間の日付が不正です");
    });

    it("rejects endDate before startDate", () => {
      expect(
        validateConversationActivePeriods([
          { startDate: "2026-01-10", endDate: "2026-01-01" },
        ]),
      ).toBe("会話期間の終了日は開始日以降にしてください");
    });
  });

  describe("listConversations", () => {
    it("returns conversations from repository", async () => {
      mockGetConversations.mockResolvedValue([baseConversation]);

      const result = await listConversations(client, "user-1");

      expect(result).toEqual([baseConversation]);
      expect(mockGetConversations).toHaveBeenCalledWith(client, "user-1");
    });
  });

  describe("getConversationWithRecords", () => {
    it("returns conversation with metadata and its records", async () => {
      mockGetConversation.mockResolvedValue(baseConversation);
      mockGetConversationActivePeriods.mockResolvedValue(activePeriods);
      mockGetRecordsByConversation.mockResolvedValue([baseRecord]);

      const result = await getConversationWithRecords(client, "conv-1");

      expect(result).toEqual({
        ...baseConversation,
        activePeriods,
        activeDays: 10,
        records: [baseRecord],
      });
      expect(mockGetConversation).toHaveBeenCalledWith(client, "conv-1");
      expect(mockGetConversationActivePeriods).toHaveBeenCalledWith(
        client,
        "conv-1",
      );
      expect(mockGetRecordsByConversation).toHaveBeenCalledWith(
        client,
        "conv-1",
      );
    });

    it("returns null when conversation not found", async () => {
      mockGetConversation.mockResolvedValue(null);

      const result = await getConversationWithRecords(client, "nonexistent");

      expect(result).toBeNull();
      expect(mockGetConversationActivePeriods).not.toHaveBeenCalled();
      expect(mockGetRecordsByConversation).not.toHaveBeenCalled();
    });
  });

  describe("validateCreateConversationInput", () => {
    it("returns null for valid input", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "有効なタイトル",
          idolGroup: "nogizaka",
          activePeriods: [{ startDate: "2026-01-01", endDate: null }],
        }),
      ).toBeNull();
    });

    it("rejects empty title", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "",
          idolGroup: "nogizaka",
          activePeriods: [{ startDate: "2026-01-01", endDate: null }],
        }),
      ).toBe("タイトルを入力してください");
    });

    it("rejects missing idolGroup", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "テスト会話",
          idolGroup: "invalid" as never,
          activePeriods: [{ startDate: "2026-01-01", endDate: null }],
        }),
      ).toBe("グループを選択してください");
    });

    it("rejects invalid active periods", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "テスト会話",
          idolGroup: "nogizaka",
          activePeriods: [],
        }),
      ).toBe("会話期間を1件以上入力してください");
    });
  });

  describe("createNewConversation", () => {
    it("creates conversation with metadata", async () => {
      mockCreateConversation.mockResolvedValue(baseConversation);
      mockCreateConversationActivePeriods.mockResolvedValue(activePeriods);

      const result = await createNewConversation(client, {
        userId: "user-1",
        title: "  テスト会話  ",
        idolGroup: "nogizaka",
        coverImagePath: "user-1/conv-1/cover/main.jpg",
        activePeriods: [{ startDate: "2026-01-01", endDate: "2026-01-10" }],
      });

      expect(result.activeDays).toBe(10);
      expect(mockCreateConversation).toHaveBeenCalledWith(client, {
        userId: "user-1",
        title: "テスト会話",
        idolGroup: "nogizaka",
        sourceId: undefined,
        coverImagePath: "user-1/conv-1/cover/main.jpg",
      });
      expect(mockCreateConversationActivePeriods).toHaveBeenCalledWith(client, [
        {
          conversationId: "conv-1",
          startDate: "2026-01-01",
          endDate: "2026-01-10",
        },
      ]);
    });

    it("throws on invalid input", async () => {
      await expect(
        createNewConversation(client, {
          userId: "user-1",
          title: "",
          idolGroup: "nogizaka",
          activePeriods: [{ startDate: "2026-01-01", endDate: null }],
        }),
      ).rejects.toThrow("タイトルを入力してください");

      expect(mockCreateConversation).not.toHaveBeenCalled();
      expect(mockCreateConversationActivePeriods).not.toHaveBeenCalled();
    });
  });

  describe("validateUpdateConversationInput", () => {
    it("returns null for valid input", () => {
      expect(
        validateUpdateConversationInput({ idolGroup: "sakurazaka" }),
      ).toBeNull();
    });

    it("rejects empty update input", () => {
      expect(validateUpdateConversationInput({})).toBe(
        "更新項目を指定してください",
      );
    });

    it("rejects invalid active periods", () => {
      expect(
        validateUpdateConversationInput({
          activePeriods: [],
        }),
      ).toBe("会話期間を1件以上入力してください");
    });
  });

  describe("updateExistingConversation", () => {
    it("updates conversation metadata and periods", async () => {
      mockUpdateConversation.mockResolvedValue({
        ...baseConversation,
        title: "更新後",
        idolGroup: "hinatazaka",
      });
      mockReplaceConversationActivePeriods.mockResolvedValue([
        {
          ...activePeriods[0],
          endDate: null,
        },
      ]);

      const result = await updateExistingConversation(client, "conv-1", {
        title: "  更新後  ",
        idolGroup: "hinatazaka",
        activePeriods: [{ startDate: "2026-01-01", endDate: null }],
      });

      expect(result.idolGroup).toBe("hinatazaka");
      expect(mockUpdateConversation).toHaveBeenCalledWith(client, "conv-1", {
        title: "更新後",
        idolGroup: "hinatazaka",
        sourceId: undefined,
        coverImagePath: undefined,
      });
      expect(mockReplaceConversationActivePeriods).toHaveBeenCalledWith(
        client,
        "conv-1",
        [{ startDate: "2026-01-01", endDate: null }],
      );
    });

    it("loads existing periods when periods are not updated", async () => {
      mockUpdateConversation.mockResolvedValue(baseConversation);
      mockGetConversationActivePeriods.mockResolvedValue(activePeriods);

      const result = await updateExistingConversation(client, "conv-1", {
        coverImagePath: null,
      });

      expect(result.activeDays).toBe(10);
      expect(mockGetConversationActivePeriods).toHaveBeenCalledWith(
        client,
        "conv-1",
      );
      expect(mockReplaceConversationActivePeriods).not.toHaveBeenCalled();
    });

    it("throws when no update fields are provided", async () => {
      await expect(
        updateExistingConversation(client, "conv-1", {}),
      ).rejects.toThrow("更新項目を指定してください");

      expect(mockUpdateConversation).not.toHaveBeenCalled();
    });
  });

  describe("deleteExistingConversation", () => {
    it("deletes conversation via repository", async () => {
      mockDeleteConversation.mockResolvedValue(undefined);

      await deleteExistingConversation(client, "conv-1");

      expect(mockDeleteConversation).toHaveBeenCalledWith(client, "conv-1");
    });
  });
});
