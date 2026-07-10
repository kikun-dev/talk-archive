import { describe, it, expect } from "vitest";
import {
  MEDIA_FILE_LIMITS,
  validateMediaFileSelection,
} from "./mediaFileSelection";

function makeFile(params: {
  name: string;
  type: string;
  size: number;
}): File {
  const file = new File([""], params.name, { type: params.type });
  Object.defineProperty(file, "size", { value: params.size });
  return file;
}

describe("mediaFileSelection", () => {
  describe("validateMediaFileSelection", () => {
    it("accepts an image file exactly at the 10MB limit", () => {
      const file = makeFile({
        name: "a.jpg",
        type: "image/jpeg",
        size: MEDIA_FILE_LIMITS.image.maxSize,
      });

      expect(validateMediaFileSelection("image", file)).toBeNull();
    });

    it("rejects an image file 1 byte over the 10MB limit", () => {
      const file = makeFile({
        name: "a.jpg",
        type: "image/jpeg",
        size: MEDIA_FILE_LIMITS.image.maxSize + 1,
      });

      expect(validateMediaFileSelection("image", file)).toBe(
        "ファイルサイズは10MB以内にしてください",
      );
    });

    it("accepts a video file exactly at the 50MB limit", () => {
      const file = makeFile({
        name: "a.mp4",
        type: "video/mp4",
        size: MEDIA_FILE_LIMITS.video.maxSize,
      });

      expect(validateMediaFileSelection("video", file)).toBeNull();
    });

    it("rejects a video file 1 byte over the 50MB limit", () => {
      const file = makeFile({
        name: "a.mp4",
        type: "video/mp4",
        size: MEDIA_FILE_LIMITS.video.maxSize + 1,
      });

      expect(validateMediaFileSelection("video", file)).toBe(
        "ファイルサイズは50MB以内にしてください",
      );
    });

    it("accepts an audio file exactly at the 50MB limit", () => {
      const file = makeFile({
        name: "a.mp3",
        type: "audio/mpeg",
        size: MEDIA_FILE_LIMITS.audio.maxSize,
      });

      expect(validateMediaFileSelection("audio", file)).toBeNull();
    });

    it("rejects an audio file 1 byte over the 50MB limit", () => {
      const file = makeFile({
        name: "a.mp3",
        type: "audio/mpeg",
        size: MEDIA_FILE_LIMITS.audio.maxSize + 1,
      });

      expect(validateMediaFileSelection("audio", file)).toBe(
        "ファイルサイズは50MB以内にしてください",
      );
    });

    it("rejects a mime type mismatch for image", () => {
      const file = makeFile({
        name: "a.mp4",
        type: "video/mp4",
        size: 1024,
      });

      expect(validateMediaFileSelection("image", file)).toBe(
        "画像ファイルを選択してください",
      );
    });

    it("rejects a mime type mismatch for video", () => {
      const file = makeFile({
        name: "a.jpg",
        type: "image/jpeg",
        size: 1024,
      });

      expect(validateMediaFileSelection("video", file)).toBe(
        "動画ファイルを選択してください",
      );
    });

    it("rejects a mime type mismatch for audio", () => {
      const file = makeFile({
        name: "a.jpg",
        type: "image/jpeg",
        size: 1024,
      });

      expect(validateMediaFileSelection("audio", file)).toBe(
        "音声ファイルを選択してください",
      );
    });

    it("accepts a valid small file for each kind", () => {
      expect(
        validateMediaFileSelection(
          "image",
          makeFile({ name: "a.png", type: "image/png", size: 100 }),
        ),
      ).toBeNull();
      expect(
        validateMediaFileSelection(
          "video",
          makeFile({ name: "a.mov", type: "video/quicktime", size: 100 }),
        ),
      ).toBeNull();
      expect(
        validateMediaFileSelection(
          "audio",
          makeFile({ name: "a.wav", type: "audio/wav", size: 100 }),
        ),
      ).toBeNull();
    });
  });

  describe("MEDIA_FILE_LIMITS", () => {
    it("exposes accept, size, and label metadata per kind", () => {
      expect(MEDIA_FILE_LIMITS.image.accept).toBe("image/*");
      expect(MEDIA_FILE_LIMITS.video.accept).toBe("video/*");
      expect(MEDIA_FILE_LIMITS.audio.accept).toBe("audio/*");
      expect(MEDIA_FILE_LIMITS.image.maxLabel).toBe("10MB");
      expect(MEDIA_FILE_LIMITS.video.maxLabel).toBe("50MB");
      expect(MEDIA_FILE_LIMITS.audio.maxLabel).toBe("50MB");
    });
  });
});
