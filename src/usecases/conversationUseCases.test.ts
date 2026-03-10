import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Conversation, Record } from "@/types/domain";
import {
  listConversations,
  getConversationWithRecords,
  createNewConversation,
  updateExistingConversation,
  deleteExistingConversation,
  validateCreateConversationInput,
  validateUpdateConversationInput,
} from "./conversationUseCases";

vi.mock("@/repositories/conversationRepository");
vi.mock("@/repositories/recordRepository");

import {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} from "@/repositories/conversationRepository";
import { getRecordsByConversation } from "@/repositories/recordRepository";

const mockGetConversations = vi.mocked(getConversations);
const mockGetConversation = vi.mocked(getConversation);
const mockCreateConversation = vi.mocked(createConversation);
const mockUpdateConversation = vi.mocked(updateConversation);
const mockDeleteConversation = vi.mocked(deleteConversation);
const mockGetRecordsByConversation = vi.mocked(getRecordsByConversation);

const client = {} as SupabaseClient<Database>;

const baseConversation: Conversation = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  title: "テスト会話",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

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

  describe("listConversations", () => {
    it("returns conversations from repository", async () => {
      mockGetConversations.mockResolvedValue([baseConversation]);

      const result = await listConversations(client, "user-1");

      expect(result).toEqual([baseConversation]);
      expect(mockGetConversations).toHaveBeenCalledWith(client, "user-1");
    });
  });

  describe("getConversationWithRecords", () => {
    it("returns conversation with its records", async () => {
      mockGetConversation.mockResolvedValue(baseConversation);
      mockGetRecordsByConversation.mockResolvedValue([baseRecord]);

      const result = await getConversationWithRecords(client, "conv-1");

      expect(result).toEqual({
        ...baseConversation,
        records: [baseRecord],
      });
      expect(mockGetConversation).toHaveBeenCalledWith(client, "conv-1");
      expect(mockGetRecordsByConversation).toHaveBeenCalledWith(
        client,
        "conv-1",
      );
    });

    it("returns null when conversation not found", async () => {
      mockGetConversation.mockResolvedValue(null);

      const result = await getConversationWithRecords(
        client,
        "nonexistent",
      );

      expect(result).toBeNull();
      expect(mockGetRecordsByConversation).not.toHaveBeenCalled();
    });
  });

  describe("validateCreateConversationInput", () => {
    it("returns null for valid input", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "有効なタイトル",
        }),
      ).toBeNull();
    });

    it("rejects empty title", () => {
      expect(
        validateCreateConversationInput({ userId: "user-1", title: "" }),
      ).toBe("タイトルを入力してください");
    });

    it("rejects whitespace-only title", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "   ",
        }),
      ).toBe("タイトルを入力してください");
    });

    it("rejects title over 200 characters", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "あ".repeat(201),
        }),
      ).toBe("タイトルは200文字以内で入力してください");
    });

    it("accepts title of exactly 200 characters", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "あ".repeat(200),
        }),
      ).toBeNull();
    });
  });

  describe("createNewConversation", () => {
    it("creates conversation with trimmed title", async () => {
      mockCreateConversation.mockResolvedValue(baseConversation);

      await createNewConversation(client, {
        userId: "user-1",
        title: "  テスト会話  ",
      });

      expect(mockCreateConversation).toHaveBeenCalledWith(client, {
        userId: "user-1",
        title: "テスト会話",
        sourceId: undefined,
      });
    });

    it("creates conversation with sourceId", async () => {
      mockCreateConversation.mockResolvedValue({
        ...baseConversation,
        sourceId: "src-1",
      });

      await createNewConversation(client, {
        userId: "user-1",
        title: "テスト会話",
        sourceId: "src-1",
      });

      expect(mockCreateConversation).toHaveBeenCalledWith(client, {
        userId: "user-1",
        title: "テスト会話",
        sourceId: "src-1",
      });
    });

    it("throws on invalid input", async () => {
      await expect(
        createNewConversation(client, { userId: "user-1", title: "" }),
      ).rejects.toThrow("タイトルを入力してください");

      expect(mockCreateConversation).not.toHaveBeenCalled();
    });
  });

  describe("validateUpdateConversationInput", () => {
    it("returns null for valid input", () => {
      expect(
        validateUpdateConversationInput({ title: "新しいタイトル" }),
      ).toBeNull();
    });

    it("returns null when title is not provided", () => {
      expect(
        validateUpdateConversationInput({ sourceId: "src-1" }),
      ).toBeNull();
    });

    it("rejects empty title", () => {
      expect(validateUpdateConversationInput({ title: "" })).toBe(
        "タイトルを入力してください",
      );
    });

    it("rejects title over 200 characters", () => {
      expect(
        validateUpdateConversationInput({ title: "あ".repeat(201) }),
      ).toBe("タイトルは200文字以内で入力してください");
    });
  });

  describe("updateExistingConversation", () => {
    it("updates conversation with trimmed title", async () => {
      mockUpdateConversation.mockResolvedValue({
        ...baseConversation,
        title: "更新後",
      });

      await updateExistingConversation(client, "conv-1", {
        title: "  更新後  ",
      });

      expect(mockUpdateConversation).toHaveBeenCalledWith(
        client,
        "conv-1",
        {
          title: "更新後",
          sourceId: undefined,
        },
      );
    });

    it("updates sourceId only", async () => {
      mockUpdateConversation.mockResolvedValue({
        ...baseConversation,
        sourceId: "src-1",
      });

      await updateExistingConversation(client, "conv-1", {
        sourceId: "src-1",
      });

      expect(mockUpdateConversation).toHaveBeenCalledWith(
        client,
        "conv-1",
        {
          title: undefined,
          sourceId: "src-1",
        },
      );
    });

    it("throws on invalid input", async () => {
      await expect(
        updateExistingConversation(client, "conv-1", { title: "" }),
      ).rejects.toThrow("タイトルを入力してください");

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
