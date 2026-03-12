import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Record, Attachment } from "@/types/domain";
import {
  addTextRecord,
  updateExistingRecord,
  deleteExistingRecord,
  validateAddTextRecordInput,
  validateUpdateRecordInput,
  addImageRecord,
  addVideoRecord,
  addAudioRecord,
  validateAddMediaRecordInput,
  getMediaUrlsForRecords,
  getRecordsByDate,
} from "./recordUseCases";

vi.mock("@/repositories/recordRepository");
vi.mock("@/repositories/attachmentRepository");
vi.mock("@/repositories/storageService");

import {
  createTextRecordAtNextPosition,
  createMediaRecordAtNextPosition,
  updateRecord,
  deleteRecord,
  getRecordsByConversationAndDateRange,
} from "@/repositories/recordRepository";
import {
  createAttachment,
  getAttachmentsByRecordIds,
} from "@/repositories/attachmentRepository";
import {
  buildStoragePath,
  uploadFile,
  getFileUrl,
  deleteFile,
} from "@/repositories/storageService";

const mockCreateTextRecordAtNextPosition = vi.mocked(
  createTextRecordAtNextPosition,
);
const mockCreateMediaRecordAtNextPosition = vi.mocked(
  createMediaRecordAtNextPosition,
);
const mockUpdateRecord = vi.mocked(updateRecord);
const mockDeleteRecord = vi.mocked(deleteRecord);
const mockCreateAttachment = vi.mocked(createAttachment);
const mockGetAttachmentsByRecordIds = vi.mocked(getAttachmentsByRecordIds);
const mockBuildStoragePath = vi.mocked(buildStoragePath);
const mockUploadFile = vi.mocked(uploadFile);
const mockGetFileUrl = vi.mocked(getFileUrl);
const mockDeleteFile = vi.mocked(deleteFile);
const mockGetRecordsByConversationAndDateRange = vi.mocked(
  getRecordsByConversationAndDateRange,
);

const client = {} as SupabaseClient<Database>;
const participantId = "11111111-1111-1111-1111-111111111111";

const baseRecord: Record = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: null,
  content: "テスト内容",
  hasAudio: false,
  speakerParticipantId: participantId,
  postedAt: "2026-01-01T12:00:00Z",
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("recordUseCases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const baseTextInput = {
    conversationId: "conv-1",
    content: "テスト",
    speakerParticipantId: participantId,
    postedAt: "2026-01-01T12:00:00Z",
  };

  describe("validateAddTextRecordInput", () => {
    it("returns null for valid input", () => {
      expect(validateAddTextRecordInput(baseTextInput)).toBeNull();
    });

    it("returns null with valid title", () => {
      expect(
        validateAddTextRecordInput({
          ...baseTextInput,
          title: "タイトル",
        }),
      ).toBeNull();
    });

    it("rejects empty content", () => {
      expect(
        validateAddTextRecordInput({
          ...baseTextInput,
          content: "",
        }),
      ).toBe("テキストを入力してください");
    });

    it("rejects whitespace-only content", () => {
      expect(
        validateAddTextRecordInput({
          ...baseTextInput,
          content: "   ",
        }),
      ).toBe("テキストを入力してください");
    });

    it("rejects title over 200 characters", () => {
      expect(
        validateAddTextRecordInput({
          ...baseTextInput,
          title: "あ".repeat(201),
        }),
      ).toBe("タイトルは200文字以内で入力してください");
    });

    it("accepts null title", () => {
      expect(
        validateAddTextRecordInput({
          ...baseTextInput,
          title: null,
        }),
      ).toBeNull();
    });

    it("rejects invalid speakerParticipantId", () => {
      expect(
        validateAddTextRecordInput({
          ...baseTextInput,
          speakerParticipantId: "",
        }),
      ).toBe("発言者を正しく選択してください");
    });

    it("rejects invalid postedAt", () => {
      expect(
        validateAddTextRecordInput({
          ...baseTextInput,
          postedAt: "invalid-date",
        }),
      ).toBe("投稿日時が不正です");
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
        ...baseTextInput,
        content: "新しいテキスト",
      });

      expect(result.position).toBe(2);
      expect(mockCreateTextRecordAtNextPosition).toHaveBeenCalledWith(client, {
        conversationId: "conv-1",
        title: null,
        content: "新しいテキスト",
        speakerParticipantId: participantId,
        postedAt: "2026-01-01T12:00:00Z",
      });
    });

    it("trims content and title before append", async () => {
      mockCreateTextRecordAtNextPosition.mockResolvedValue(baseRecord);

      await addTextRecord(client, {
        ...baseTextInput,
        content: "  テスト内容  ",
        title: "  タイトル  ",
      });

      expect(mockCreateTextRecordAtNextPosition).toHaveBeenCalledWith(client, {
        conversationId: "conv-1",
        title: "タイトル",
        content: "テスト内容",
        speakerParticipantId: participantId,
        postedAt: "2026-01-01T12:00:00Z",
      });
    });

    it("throws on invalid input", async () => {
      await expect(
        addTextRecord(client, {
          ...baseTextInput,
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

    it("rejects invalid speakerParticipantId", () => {
      expect(
        validateUpdateRecordInput({ speakerParticipantId: "" }),
      ).toBe("発言者を正しく選択してください");
    });

    it("rejects invalid postedAt", () => {
      expect(
        validateUpdateRecordInput({ postedAt: "invalid-date" }),
      ).toBe("投稿日時が不正です");
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
        speakerParticipantId: undefined,
        postedAt: undefined,
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
        speakerParticipantId: undefined,
        postedAt: undefined,
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

  // --- メディアレコード ---

  const imageRecord: Record = {
    id: "rec-img-1",
    conversationId: "conv-1",
    recordType: "image",
    title: null,
    content: null,
    hasAudio: false,
    speakerParticipantId: participantId,
    postedAt: "2026-01-01T12:00:00Z",
    position: 3,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const baseAttachment: Attachment = {
    id: "att-1",
    recordId: "rec-img-1",
    filePath: "user-1/conv-1/rec-img-1/photo.jpg",
    mimeType: "image/jpeg",
    fileSize: 102400,
    createdAt: "2026-01-01T00:00:00Z",
  };

  const baseMediaInput = {
    userId: "user-1",
    conversationId: "conv-1",
    file: new Blob(["test-data"], { type: "image/jpeg" }),
    filename: "photo.jpg",
    contentType: "image/jpeg",
    speakerParticipantId: participantId,
    postedAt: "2026-01-01T12:00:00Z",
  };

  function setupMediaMocks(record: Record = imageRecord) {
    mockCreateMediaRecordAtNextPosition.mockResolvedValue(record);
    mockBuildStoragePath.mockReturnValue(
      `user-1/conv-1/${record.id}/photo.jpg`,
    );
    mockUploadFile.mockResolvedValue(
      `user-1/conv-1/${record.id}/photo.jpg`,
    );
    mockCreateAttachment.mockResolvedValue({
      ...baseAttachment,
      recordId: record.id,
    });
  }

  describe("validateAddMediaRecordInput", () => {
    it("returns null for valid input", () => {
      expect(validateAddMediaRecordInput(baseMediaInput)).toBeNull();
    });

    it("rejects title over 200 characters", () => {
      expect(
        validateAddMediaRecordInput({
          ...baseMediaInput,
          title: "あ".repeat(201),
        }),
      ).toBe("タイトルは200文字以内で入力してください");
    });

    it("rejects empty filename", () => {
      expect(
        validateAddMediaRecordInput({
          ...baseMediaInput,
          filename: "",
        }),
      ).toBe("ファイル名を指定してください");
    });

    it("rejects empty contentType", () => {
      expect(
        validateAddMediaRecordInput({
          ...baseMediaInput,
          contentType: "",
        }),
      ).toBe("コンテンツタイプを指定してください");
    });

    it("rejects invalid speakerParticipantId", () => {
      expect(
        validateAddMediaRecordInput({
          ...baseMediaInput,
          speakerParticipantId: "",
        }),
      ).toBe("発言者を正しく選択してください");
    });

    it("rejects invalid postedAt", () => {
      expect(
        validateAddMediaRecordInput({
          ...baseMediaInput,
          postedAt: "invalid-date",
        }),
      ).toBe("投稿日時が不正です");
    });
  });

  describe("addImageRecord", () => {
    it("orchestrates record creation, upload, and attachment", async () => {
      setupMediaMocks();

      const result = await addImageRecord(client, baseMediaInput);

      expect(result.record.id).toBe("rec-img-1");
      expect(result.record.recordType).toBe("image");
      expect(result.attachment.id).toBe("att-1");

      expect(mockCreateMediaRecordAtNextPosition).toHaveBeenCalledWith(client, {
        conversationId: "conv-1",
        recordType: "image",
        title: null,
        content: null,
        hasAudio: false,
        speakerParticipantId: participantId,
        postedAt: "2026-01-01T12:00:00Z",
      });
      expect(mockUploadFile).toHaveBeenCalledWith(client, {
        path: "user-1/conv-1/rec-img-1/photo.jpg",
        file: baseMediaInput.file,
        contentType: "image/jpeg",
      });
      expect(mockCreateAttachment).toHaveBeenCalledWith(client, {
        recordId: "rec-img-1",
        filePath: "user-1/conv-1/rec-img-1/photo.jpg",
        mimeType: "image/jpeg",
        fileSize: baseMediaInput.file.size,
      });
    });

    it("trims title", async () => {
      setupMediaMocks();

      await addImageRecord(client, {
        ...baseMediaInput,
        title: "  タイトル  ",
      });

      expect(mockCreateMediaRecordAtNextPosition).toHaveBeenCalledWith(
        client,
        expect.objectContaining({ title: "タイトル" }),
      );
    });

    it("throws on validation error without creating record", async () => {
      await expect(
        addImageRecord(client, { ...baseMediaInput, filename: "" }),
      ).rejects.toThrow("ファイル名を指定してください");

      expect(mockCreateMediaRecordAtNextPosition).not.toHaveBeenCalled();
    });

    it("rolls back record on upload failure", async () => {
      mockCreateMediaRecordAtNextPosition.mockResolvedValue(imageRecord);
      mockBuildStoragePath.mockReturnValue(
        "user-1/conv-1/rec-img-1/photo.jpg",
      );
      mockUploadFile.mockRejectedValue(new Error("Upload failed"));
      mockDeleteRecord.mockResolvedValue(undefined);

      await expect(
        addImageRecord(client, baseMediaInput),
      ).rejects.toThrow("Upload failed");

      expect(mockDeleteRecord).toHaveBeenCalledWith(client, "rec-img-1");
    });

    it("rolls back record and storage on attachment creation failure", async () => {
      mockCreateMediaRecordAtNextPosition.mockResolvedValue(imageRecord);
      mockBuildStoragePath.mockReturnValue(
        "user-1/conv-1/rec-img-1/photo.jpg",
      );
      mockUploadFile.mockResolvedValue(
        "user-1/conv-1/rec-img-1/photo.jpg",
      );
      mockCreateAttachment.mockRejectedValue(
        new Error("Attachment failed"),
      );
      mockDeleteFile.mockResolvedValue(undefined);
      mockDeleteRecord.mockResolvedValue(undefined);

      await expect(
        addImageRecord(client, baseMediaInput),
      ).rejects.toThrow("Attachment failed");

      expect(mockDeleteFile).toHaveBeenCalledWith(
        client,
        "user-1/conv-1/rec-img-1/photo.jpg",
      );
      expect(mockDeleteRecord).toHaveBeenCalledWith(client, "rec-img-1");
    });
  });

  describe("addVideoRecord", () => {
    const videoRecord: Record = {
      ...imageRecord,
      id: "rec-vid-1",
      recordType: "video",
      hasAudio: true,
    };

    it("creates video record with hasAudio flag", async () => {
      mockCreateMediaRecordAtNextPosition.mockResolvedValue(videoRecord);
      mockBuildStoragePath.mockReturnValue(
        "user-1/conv-1/rec-vid-1/video.mp4",
      );
      mockUploadFile.mockResolvedValue(
        "user-1/conv-1/rec-vid-1/video.mp4",
      );
      mockCreateAttachment.mockResolvedValue({
        ...baseAttachment,
        id: "att-vid-1",
        recordId: "rec-vid-1",
        filePath: "user-1/conv-1/rec-vid-1/video.mp4",
        mimeType: "video/mp4",
      });

      const result = await addVideoRecord(client, {
        ...baseMediaInput,
        filename: "video.mp4",
        contentType: "video/mp4",
        hasAudio: true,
      });

      expect(result.record.recordType).toBe("video");
      expect(mockCreateMediaRecordAtNextPosition).toHaveBeenCalledWith(
        client,
        expect.objectContaining({
          recordType: "video",
          hasAudio: true,
        }),
      );
    });

    it("creates video record without audio", async () => {
      const silentVideoRecord = { ...videoRecord, hasAudio: false };
      mockCreateMediaRecordAtNextPosition.mockResolvedValue(silentVideoRecord);
      mockBuildStoragePath.mockReturnValue(
        "user-1/conv-1/rec-vid-1/video.mp4",
      );
      mockUploadFile.mockResolvedValue(
        "user-1/conv-1/rec-vid-1/video.mp4",
      );
      mockCreateAttachment.mockResolvedValue({
        ...baseAttachment,
        recordId: "rec-vid-1",
      });

      await addVideoRecord(client, {
        ...baseMediaInput,
        filename: "video.mp4",
        contentType: "video/mp4",
        hasAudio: false,
      });

      expect(mockCreateMediaRecordAtNextPosition).toHaveBeenCalledWith(
        client,
        expect.objectContaining({ hasAudio: false }),
      );
    });
  });

  describe("addAudioRecord", () => {
    const audioRecord: Record = {
      ...imageRecord,
      id: "rec-aud-1",
      recordType: "audio",
    };

    it("creates audio record", async () => {
      mockCreateMediaRecordAtNextPosition.mockResolvedValue(audioRecord);
      mockBuildStoragePath.mockReturnValue(
        "user-1/conv-1/rec-aud-1/audio.mp3",
      );
      mockUploadFile.mockResolvedValue(
        "user-1/conv-1/rec-aud-1/audio.mp3",
      );
      mockCreateAttachment.mockResolvedValue({
        ...baseAttachment,
        id: "att-aud-1",
        recordId: "rec-aud-1",
        filePath: "user-1/conv-1/rec-aud-1/audio.mp3",
        mimeType: "audio/mpeg",
      });

      const result = await addAudioRecord(client, {
        ...baseMediaInput,
        filename: "audio.mp3",
        contentType: "audio/mpeg",
      });

      expect(result.record.recordType).toBe("audio");
      expect(mockCreateMediaRecordAtNextPosition).toHaveBeenCalledWith(
        client,
        expect.objectContaining({ recordType: "audio" }),
      );
    });
  });

  // --- メディア表示 ---

  describe("getMediaUrlsForRecords", () => {
    const textRecord: Record = {
      ...baseRecord,
      id: "rec-text-1",
      recordType: "text",
    };

    const imgRecord: Record = {
      ...baseRecord,
      id: "rec-img-1",
      recordType: "image",
    };

    const vidRecord: Record = {
      ...baseRecord,
      id: "rec-vid-1",
      recordType: "video",
    };

    const audRecord: Record = {
      ...baseRecord,
      id: "rec-aud-1",
      recordType: "audio",
    };

    it("returns empty map when no media records exist", async () => {
      const result = await getMediaUrlsForRecords(client, [textRecord]);

      expect(result.size).toBe(0);
      expect(mockGetAttachmentsByRecordIds).not.toHaveBeenCalled();
    });

    it("returns empty map for empty records array", async () => {
      const result = await getMediaUrlsForRecords(client, []);

      expect(result.size).toBe(0);
    });

    it("fetches signed URLs for media records", async () => {
      mockGetAttachmentsByRecordIds.mockResolvedValue([
        {
          ...baseAttachment,
          recordId: "rec-img-1",
          filePath: "user-1/conv-1/rec-img-1/photo.jpg",
          mimeType: "image/jpeg",
        },
      ]);
      mockGetFileUrl.mockResolvedValue("https://example.supabase.co/signed-url");

      const result = await getMediaUrlsForRecords(client, [
        textRecord,
        imgRecord,
      ]);

      expect(result.size).toBe(1);
      expect(result.get("rec-img-1")).toEqual({
        url: "https://example.supabase.co/signed-url",
        mimeType: "image/jpeg",
      });
      expect(mockGetAttachmentsByRecordIds).toHaveBeenCalledWith(client, [
        "rec-img-1",
      ]);
    });

    it("handles multiple media types", async () => {
      mockGetAttachmentsByRecordIds.mockResolvedValue([
        {
          ...baseAttachment,
          recordId: "rec-img-1",
          filePath: "path/photo.jpg",
          mimeType: "image/jpeg",
        },
        {
          ...baseAttachment,
          id: "att-2",
          recordId: "rec-vid-1",
          filePath: "path/video.mp4",
          mimeType: "video/mp4",
        },
        {
          ...baseAttachment,
          id: "att-3",
          recordId: "rec-aud-1",
          filePath: "path/audio.mp3",
          mimeType: "audio/mpeg",
        },
      ]);
      mockGetFileUrl
        .mockResolvedValueOnce("https://example.supabase.co/img-url")
        .mockResolvedValueOnce("https://example.supabase.co/vid-url")
        .mockResolvedValueOnce("https://example.supabase.co/aud-url");

      const result = await getMediaUrlsForRecords(client, [
        imgRecord,
        vidRecord,
        audRecord,
      ]);

      expect(result.size).toBe(3);
      expect(result.get("rec-img-1")?.mimeType).toBe("image/jpeg");
      expect(result.get("rec-vid-1")?.mimeType).toBe("video/mp4");
      expect(result.get("rec-aud-1")?.mimeType).toBe("audio/mpeg");
    });

    it("skips records with no attachments", async () => {
      mockGetAttachmentsByRecordIds.mockResolvedValue([]);

      const result = await getMediaUrlsForRecords(client, [imgRecord]);

      expect(result.size).toBe(0);
      expect(mockGetFileUrl).not.toHaveBeenCalled();
    });
  });

  // --- 日付検索 ---

  describe("getRecordsByDate", () => {
    it("converts date to JST range and calls repository", async () => {
      mockGetRecordsByConversationAndDateRange.mockResolvedValue([baseRecord]);

      const result = await getRecordsByDate(client, "conv-1", "2026-03-10");

      expect(result).toEqual([baseRecord]);
      expect(mockGetRecordsByConversationAndDateRange).toHaveBeenCalledWith(
        client,
        "conv-1",
        "2026-03-10T00:00:00+09:00",
        "2026-03-11T00:00:00+09:00",
      );
    });

    it("handles month boundary (end of month)", async () => {
      mockGetRecordsByConversationAndDateRange.mockResolvedValue([]);

      await getRecordsByDate(client, "conv-1", "2026-01-31");

      expect(mockGetRecordsByConversationAndDateRange).toHaveBeenCalledWith(
        client,
        "conv-1",
        "2026-01-31T00:00:00+09:00",
        "2026-02-01T00:00:00+09:00",
      );
    });

    it("handles year boundary (Dec 31)", async () => {
      mockGetRecordsByConversationAndDateRange.mockResolvedValue([]);

      await getRecordsByDate(client, "conv-1", "2025-12-31");

      expect(mockGetRecordsByConversationAndDateRange).toHaveBeenCalledWith(
        client,
        "conv-1",
        "2025-12-31T00:00:00+09:00",
        "2026-01-01T00:00:00+09:00",
      );
    });

    it("throws on invalid date format", async () => {
      await expect(
        getRecordsByDate(client, "conv-1", "2026/03/10"),
      ).rejects.toThrow("日付の形式が不正です");

      expect(mockGetRecordsByConversationAndDateRange).not.toHaveBeenCalled();
    });

    it("throws on non-existent date", async () => {
      await expect(
        getRecordsByDate(client, "conv-1", "2026-02-30"),
      ).rejects.toThrow("日付の形式が不正です");

      expect(mockGetRecordsByConversationAndDateRange).not.toHaveBeenCalled();
    });

    it("throws on empty string", async () => {
      await expect(
        getRecordsByDate(client, "conv-1", ""),
      ).rejects.toThrow("日付の形式が不正です");

      expect(mockGetRecordsByConversationAndDateRange).not.toHaveBeenCalled();
    });
  });
});
