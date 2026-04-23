import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  buildParticipantThumbnailPath,
  buildStoragePath,
  uploadFile,
  getFileUrl,
  getFileUrls,
  deleteFile,
  deleteFiles,
} from "./storageService";

function createMockStorageClient(overrides: {
  upload?: ReturnType<typeof vi.fn>;
  createSignedUrl?: ReturnType<typeof vi.fn>;
  createSignedUrls?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
}): SupabaseClient<Database> {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: overrides.upload ?? vi.fn(),
        createSignedUrl: overrides.createSignedUrl ?? vi.fn(),
        createSignedUrls: overrides.createSignedUrls ?? vi.fn(),
        remove: overrides.remove ?? vi.fn(),
      }),
    },
  } as unknown as SupabaseClient<Database>;
}

describe("storageService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("buildStoragePath", () => {
    it("builds path in the correct format", () => {
      const path = buildStoragePath({
        userId: "user-1",
        conversationId: "conv-1",
        recordId: "rec-1",
        filename: "photo.jpg",
      });

      expect(path).toBe("user-1/conv-1/rec-1/photo.jpg");
    });
  });

  describe("buildParticipantThumbnailPath", () => {
    it("builds path in the participant thumbnail format", () => {
      const path = buildParticipantThumbnailPath({
        userId: "user-1",
        participantId: "participant-1",
        filename: "photo.jpg",
      });

      expect(path).toBe("user-1/participants/participant-1/photo.jpg");
    });
  });

  describe("uploadFile", () => {
    it("uploads a file and returns the path", async () => {
      const upload = vi
        .fn()
        .mockResolvedValue({ data: { path: "user-1/conv-1/rec-1/photo.jpg" }, error: null });
      const client = createMockStorageClient({ upload });

      const file = new Blob(["test"], { type: "image/jpeg" });
      const result = await uploadFile(client, {
        path: "user-1/conv-1/rec-1/photo.jpg",
        file,
        contentType: "image/jpeg",
      });

      expect(result).toBe("user-1/conv-1/rec-1/photo.jpg");
      expect(client.storage.from).toHaveBeenCalledWith("media");
      expect(upload).toHaveBeenCalledWith(
        "user-1/conv-1/rec-1/photo.jpg",
        file,
        { contentType: "image/jpeg", upsert: false },
      );
    });

    it("throws on upload error", async () => {
      const storageError = { message: "Upload failed", statusCode: "413" };
      const upload = vi
        .fn()
        .mockResolvedValue({ data: null, error: storageError });
      const client = createMockStorageClient({ upload });

      const file = new Blob(["test"], { type: "image/jpeg" });
      await expect(
        uploadFile(client, {
          path: "user-1/conv-1/rec-1/photo.jpg",
          file,
          contentType: "image/jpeg",
        }),
      ).rejects.toEqual(storageError);
    });
  });

  describe("getFileUrl", () => {
    it("returns a signed URL", async () => {
      const createSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/signed-url" },
        error: null,
      });
      const client = createMockStorageClient({ createSignedUrl });

      const result = await getFileUrl(
        client,
        "user-1/conv-1/rec-1/photo.jpg",
      );

      expect(result).toBe("https://example.com/signed-url");
      expect(client.storage.from).toHaveBeenCalledWith("media");
      expect(createSignedUrl).toHaveBeenCalledWith(
        "user-1/conv-1/rec-1/photo.jpg",
        3600,
      );
    });

    it("throws on error", async () => {
      const storageError = { message: "Not found", statusCode: "404" };
      const createSignedUrl = vi
        .fn()
        .mockResolvedValue({ data: null, error: storageError });
      const client = createMockStorageClient({ createSignedUrl });

      await expect(
        getFileUrl(client, "user-1/conv-1/rec-1/photo.jpg"),
      ).rejects.toEqual(storageError);
    });
  });

  describe("getFileUrls", () => {
    it("returns a map of paths to signed URLs", async () => {
      const createSignedUrls = vi.fn().mockResolvedValue({
        data: [
          { path: "path/a.jpg", signedUrl: "https://example.com/a" },
          { path: "path/b.mp4", signedUrl: "https://example.com/b" },
        ],
        error: null,
      });
      const client = createMockStorageClient({ createSignedUrls });

      const result = await getFileUrls(client, ["path/a.jpg", "path/b.mp4"]);

      expect(result.size).toBe(2);
      expect(result.get("path/a.jpg")).toBe("https://example.com/a");
      expect(result.get("path/b.mp4")).toBe("https://example.com/b");
      expect(client.storage.from).toHaveBeenCalledWith("media");
      expect(createSignedUrls).toHaveBeenCalledWith(
        ["path/a.jpg", "path/b.mp4"],
        3600,
      );
    });

    it("returns empty map for empty paths array", async () => {
      const createSignedUrls = vi.fn();
      const client = createMockStorageClient({ createSignedUrls });

      const result = await getFileUrls(client, []);

      expect(result.size).toBe(0);
      expect(createSignedUrls).not.toHaveBeenCalled();
    });

    it("throws on error", async () => {
      const storageError = { message: "Batch failed", statusCode: "500" };
      const createSignedUrls = vi
        .fn()
        .mockResolvedValue({ data: null, error: storageError });
      const client = createMockStorageClient({ createSignedUrls });

      await expect(
        getFileUrls(client, ["path/a.jpg"]),
      ).rejects.toEqual(storageError);
    });

    it("throws when a batch item contains an error", async () => {
      const createSignedUrls = vi.fn().mockResolvedValue({
        data: [
          {
            path: "path/a.jpg",
            signedUrl: null,
            error: "not found",
          },
        ],
        error: null,
      });
      const client = createMockStorageClient({ createSignedUrls });

      await expect(
        getFileUrls(client, ["path/a.jpg"]),
      ).rejects.toThrow("Signed URL generation failed for path/a.jpg: not found");
    });

    it("throws when a batch item is incomplete", async () => {
      const createSignedUrls = vi.fn().mockResolvedValue({
        data: [
          {
            path: "path/a.jpg",
            signedUrl: null,
            error: null,
          },
        ],
        error: null,
      });
      const client = createMockStorageClient({ createSignedUrls });

      await expect(
        getFileUrls(client, ["path/a.jpg"]),
      ).rejects.toThrow("Signed URL response was incomplete for path/a.jpg");
    });
  });

  describe("deleteFile", () => {
    it("deletes a file from storage", async () => {
      const remove = vi.fn().mockResolvedValue({ data: [], error: null });
      const client = createMockStorageClient({ remove });

      await expect(
        deleteFile(client, "user-1/conv-1/rec-1/photo.jpg"),
      ).resolves.toBeUndefined();

      expect(client.storage.from).toHaveBeenCalledWith("media");
      expect(remove).toHaveBeenCalledWith(["user-1/conv-1/rec-1/photo.jpg"]);
    });

    it("throws on error", async () => {
      const storageError = { message: "Delete failed", statusCode: "500" };
      const remove = vi
        .fn()
        .mockResolvedValue({ data: null, error: storageError });
      const client = createMockStorageClient({ remove });

      await expect(
        deleteFile(client, "user-1/conv-1/rec-1/photo.jpg"),
      ).rejects.toEqual(storageError);
    });
  });

  describe("deleteFiles", () => {
    it("deletes multiple files from storage", async () => {
      const remove = vi.fn().mockResolvedValue({ data: [], error: null });
      const client = createMockStorageClient({ remove });

      const paths = [
        "user-1/conv-1/rec-1/photo.jpg",
        "user-1/conv-1/rec-1/video.mp4",
      ];
      await expect(deleteFiles(client, paths)).resolves.toBeUndefined();

      expect(remove).toHaveBeenCalledWith(paths);
    });

    it("skips API call when paths array is empty", async () => {
      const remove = vi.fn();
      const client = createMockStorageClient({ remove });

      await expect(deleteFiles(client, [])).resolves.toBeUndefined();

      expect(remove).not.toHaveBeenCalled();
    });

    it("throws on error", async () => {
      const storageError = { message: "Bulk delete failed", statusCode: "500" };
      const remove = vi
        .fn()
        .mockResolvedValue({ data: null, error: storageError });
      const client = createMockStorageClient({ remove });

      await expect(
        deleteFiles(client, ["user-1/conv-1/rec-1/photo.jpg"]),
      ).rejects.toEqual(storageError);
    });
  });
});
