import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  buildStoragePath,
  uploadFile,
  getFileUrl,
  deleteFile,
  deleteFiles,
} from "./storageService";

function createMockStorageClient(overrides: {
  upload?: ReturnType<typeof vi.fn>;
  createSignedUrl?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
}): SupabaseClient<Database> {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: overrides.upload ?? vi.fn(),
        createSignedUrl: overrides.createSignedUrl ?? vi.fn(),
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
