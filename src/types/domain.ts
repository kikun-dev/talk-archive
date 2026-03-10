/** トーク種別 */
export const RecordType = {
  TEXT: "text",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
} as const;

export type RecordType = (typeof RecordType)[keyof typeof RecordType];

/** 坂道グループ */
export const IdolGroup = {
  NOGIZAKA: "nogizaka",
  SAKURAZAKA: "sakurazaka",
  HINATAZAKA: "hinatazaka",
} as const;

export type IdolGroup = (typeof IdolGroup)[keyof typeof IdolGroup];

/** ユーザー */
export type User = {
  id: string;
  email: string;
  createdAt: string;
};

/** トークの出所 */
export type Source = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

/** 会話 */
export type Conversation = {
  id: string;
  userId: string;
  sourceId: string | null;
  idolGroup: IdolGroup;
  coverImagePath: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/** 会話期間 */
export type ConversationActivePeriod = {
  id: string;
  conversationId: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
};

/** 会話参加者 */
export type ConversationParticipant = {
  id: string;
  conversationId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

/** トークレコード */
export type Record = {
  id: string;
  conversationId: string;
  recordType: RecordType;
  title: string | null;
  content: string | null;
  hasAudio: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

/** 添付ファイルメタデータ */
export type Attachment = {
  id: string;
  recordId: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
};

/** メディア一覧表示用の添付ファイル */
export type MediaAttachment = Attachment & {
  conversationId: string;
};
