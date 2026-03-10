import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Record } from "@/types/domain";
import {
  addTextRecord,
  updateExistingRecord,
  deleteExistingRecord,
  validateAddTextRecordInput,
  validateUpdateRecordInput,
} from "./recordUseCases";

vi.mock("@/repositories/recordRepository");

import {
  createTextRecordAtNextPosition,
  updateRecord,
  deleteRecord,
} from "@/repositories/recordRepository";

const mockCreateTextRecordAtNextPosition = vi.mocked(
  createTextRecordAtNextPosition,
);
const mockUpdateRecord = vi.mocked(updateRecord);
const mockDeleteRecord = vi.mocked(deleteRecord);

const client = {} as SupabaseClient<Database>;

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

describe("recordUseCases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("validateAddTextRecordInput", () => {
    it("returns null for valid input", () => {
      expect(
        validateAddTextRecordInput({
          conversationId: "conv-1",
          content: "テスト",
        }),
      ).toBeNull();
    });

    it("returns null with valid title", () => {
      expect(
        validateAddTextRecordInput({
          conversationId: "conv-1",
          content: "テスト",
          title: "タイトル",
        }),
      ).toBeNull();
    });

    it("rejects empty content", () => {
      expect(
        validateAddTextRecordInput({
          conversationId: "conv-1",
          content: "",
        }),
      ).toBe("テキストを入力してください");
    });

    it("rejects whitespace-only content", () => {
      expect(
        validateAddTextRecordInput({
          conversationId: "conv-1",
          content: "   ",
        }),
      ).toBe("テキストを入力してください");
    });

    it("rejects title over 200 characters", () => {
      expect(
        validateAddTextRecordInput({
          conversationId: "conv-1",
          content: "テスト",
          title: "あ".repeat(201),
        }),
      ).toBe("タイトルは200文字以内で入力してください");
    });

    it("accepts null title", () => {
      expect(
        validateAddTextRecordInput({
          conversationId: "conv-1",
          content: "テスト",
          title: null,
        }),
      ).toBeNull();
    });
  });

  describe("addTextRecord", () => {
    it("creates text record via repository append helper", async () => {
      mockCreateTextRecordAtNextPosition.mockResolvedValue({
        ...baseRecord,
        id: "rec-3",
        position: 2,
      });

      const result = await addTextRecord(client, {
        conversationId: "conv-1",
        content: "新しいテキスト",
      });

      expect(result.position).toBe(2);
      expect(mockCreateTextRecordAtNextPosition).toHaveBeenCalledWith(client, {
        conversationId: "conv-1",
        title: null,
        content: "新しいテキスト",
      });
    });

    it("trims content and title before append", async () => {
      mockCreateTextRecordAtNextPosition.mockResolvedValue(baseRecord);

      await addTextRecord(client, {
        conversationId: "conv-1",
        content: "  テスト内容  ",
        title: "  タイトル  ",
      });

      expect(mockCreateTextRecordAtNextPosition).toHaveBeenCalledWith(client, {
        conversationId: "conv-1",
        title: "タイトル",
        content: "テスト内容",
      });
    });

    it("throws on invalid input", async () => {
      await expect(
        addTextRecord(client, {
          conversationId: "conv-1",
          content: "",
        }),
      ).rejects.toThrow("テキストを入力してください");

      expect(mockCreateTextRecordAtNextPosition).not.toHaveBeenCalled();
    });
  });

  describe("validateUpdateRecordInput", () => {
    it("returns null for valid content update", () => {
      expect(
        validateUpdateRecordInput({ content: "更新内容" }),
      ).toBeNull();
    });

    it("returns null for valid title update", () => {
      expect(
        validateUpdateRecordInput({ title: "新タイトル" }),
      ).toBeNull();
    });

    it("returns null for null title (clearing title)", () => {
      expect(validateUpdateRecordInput({ title: null })).toBeNull();
    });

    it("rejects empty update input", () => {
      expect(validateUpdateRecordInput({})).toBe(
        "更新項目を指定してください",
      );
    });

    it("rejects when all fields are undefined", () => {
      expect(
        validateUpdateRecordInput({
          title: undefined,
          content: undefined,
        }),
      ).toBe("更新項目を指定してください");
    });

    it("rejects whitespace-only content", () => {
      expect(validateUpdateRecordInput({ content: "   " })).toBe(
        "テキストを入力してください",
      );
    });

    it("rejects null content", () => {
      expect(validateUpdateRecordInput({ content: null })).toBe(
        "テキストを入力してください",
      );
    });

    it("rejects title over 200 characters", () => {
      expect(
        validateUpdateRecordInput({ title: "あ".repeat(201) }),
      ).toBe("タイトルは200文字以内で入力してください");
    });
  });

  describe("updateExistingRecord", () => {
    it("updates content with trimming", async () => {
      mockUpdateRecord.mockResolvedValue({
        ...baseRecord,
        content: "更新後",
      });

      await updateExistingRecord(client, "rec-1", {
        content: "  更新後  ",
      });

      expect(mockUpdateRecord).toHaveBeenCalledWith(client, "rec-1", {
        title: undefined,
        content: "更新後",
      });
    });

    it("updates title to null (clear)", async () => {
      mockUpdateRecord.mockResolvedValue({
        ...baseRecord,
        title: null,
      });

      await updateExistingRecord(client, "rec-1", { title: null });

      expect(mockUpdateRecord).toHaveBeenCalledWith(client, "rec-1", {
        title: null,
        content: undefined,
      });
    });

    it("throws on invalid input", async () => {
      await expect(
        updateExistingRecord(client, "rec-1", { content: "" }),
      ).rejects.toThrow("テキストを入力してください");

      expect(mockUpdateRecord).not.toHaveBeenCalled();
    });

    it("throws on null content", async () => {
      await expect(
        updateExistingRecord(client, "rec-1", { content: null }),
      ).rejects.toThrow("テキストを入力してください");

      expect(mockUpdateRecord).not.toHaveBeenCalled();
    });

    it("throws when no update fields are provided", async () => {
      await expect(
        updateExistingRecord(client, "rec-1", {}),
      ).rejects.toThrow("更新項目を指定してください");

      expect(mockUpdateRecord).not.toHaveBeenCalled();
    });
  });

  describe("deleteExistingRecord", () => {
    it("deletes record via repository", async () => {
      mockDeleteRecord.mockResolvedValue(undefined);

      await deleteExistingRecord(client, "rec-1");

      expect(mockDeleteRecord).toHaveBeenCalledWith(client, "rec-1");
    });
  });
});
