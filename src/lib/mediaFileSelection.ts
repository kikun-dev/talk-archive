/**
 * メディア添付ファイルの選択検証（composer / 後添付フォームで共有）
 */

export type MediaFileKind = "image" | "video" | "audio";

const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_MEDIA_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const MEDIA_FILE_LIMITS: {
  [K in MediaFileKind]: {
    maxSize: number;
    maxLabel: string;
    typeLabel: string;
    mimePrefix: string;
    accept: string;
  };
} = {
  image: {
    maxSize: MAX_IMAGE_FILE_SIZE,
    maxLabel: "10MB",
    typeLabel: "画像",
    mimePrefix: "image/",
    accept: "image/*",
  },
  video: {
    maxSize: MAX_MEDIA_FILE_SIZE,
    maxLabel: "50MB",
    typeLabel: "動画",
    mimePrefix: "video/",
    accept: "video/*",
  },
  audio: {
    maxSize: MAX_MEDIA_FILE_SIZE,
    maxLabel: "50MB",
    typeLabel: "音声",
    mimePrefix: "audio/",
    accept: "audio/*",
  },
};

/**
 * 選択されたファイルの種別・サイズを検証する
 * 問題があればユーザー向けエラーメッセージを、問題なければ null を返す
 */
export function validateMediaFileSelection(
  kind: MediaFileKind,
  file: File,
): string | null {
  const limits = MEDIA_FILE_LIMITS[kind];

  if (file.size > limits.maxSize) {
    return `ファイルサイズは${limits.maxLabel}以内にしてください`;
  }

  if (!file.type.startsWith(limits.mimePrefix)) {
    return `${limits.typeLabel}ファイルを選択してください`;
  }

  return null;
}
