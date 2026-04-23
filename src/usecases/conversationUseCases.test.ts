import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  Conversation,
  ConversationActivePeriod,
  ConversationParticipant,
  Record,
} from "@/types/domain";
import {
  calculateConversationActiveDays,
  createNewConversation,
  deleteExistingConversation,
  getConversationCoverUrls,
  getConversationWithParticipants,
  getConversationWithRecords,
  getParticipantThumbnailUrls,
  listConversationsWithMetadata,
  listConversations,
  updateConversationCoverImage,
  updateExistingConversation,
  updateParticipantThumbnailImage,
  validateConversationActivePeriods,
  validateConversationParticipants,
  validateCreateConversationInput,
  validateUpdateConversationInput,
  validateParticipantsPreserveExisting,
} from "./conversationUseCases";

vi.mock("@/repositories/conversationRepository");
vi.mock("@/repositories/conversationActivePeriodRepository");
vi.mock("@/repositories/conversationParticipantRepository");
vi.mock("@/repositories/recordRepository");
vi.mock("@/repositories/storageService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/repositories/storageService")>();
  return {
    ...actual,
    getFileUrls: vi.fn(),
    uploadFile: vi.fn(),
  };
});

import {
  createConversationWithMetadata,
  deleteConversation,
  getConversation,
  getConversations,
  updateConversation,
  updateConversationWithMetadata,
} from "@/repositories/conversationRepository";
import {
  getConversationActivePeriods,
  listConversationActivePeriods,
} from "@/repositories/conversationActivePeriodRepository";
import {
  getConversationParticipants,
  updateConversationParticipantThumbnail,
} from "@/repositories/conversationParticipantRepository";
import { getRecordsByConversation } from "@/repositories/recordRepository";
import { getFileUrls, uploadFile } from "@/repositories/storageService";

const mockGetConversations = vi.mocked(getConversations);
const mockGetConversation = vi.mocked(getConversation);
const mockCreateConversationWithMetadata = vi.mocked(
  createConversationWithMetadata,
);
const mockUpdateConversation = vi.mocked(updateConversation);
const mockUpdateConversationWithMetadata = vi.mocked(
  updateConversationWithMetadata,
);
const mockDeleteConversation = vi.mocked(deleteConversation);
const mockGetConversationActivePeriods = vi.mocked(
  getConversationActivePeriods,
);
const mockListConversationActivePeriods = vi.mocked(
  listConversationActivePeriods,
);
const mockGetConversationParticipants = vi.mocked(
  getConversationParticipants,
);
const mockUpdateConversationParticipantThumbnail = vi.mocked(
  updateConversationParticipantThumbnail,
);
const mockGetRecordsByConversation = vi.mocked(getRecordsByConversation);
const mockGetFileUrls = vi.mocked(getFileUrls);
const mockUploadFile = vi.mocked(uploadFile);

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

const participantId1 = "a0000000-0000-0000-0000-000000000001";
const participantId2 = "a0000000-0000-0000-0000-000000000002";

const participants: ConversationParticipant[] = [
  {
    id: participantId1,
    conversationId: "conv-1",
    name: "メンバーA",
    sortOrder: 0,
    thumbnailPath: null,
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
  speakerParticipantId: "part-1",
  postedAt: "2026-01-01T12:00:00Z",
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

    it("returns 0 when an ongoing period starts in the future", () => {
      expect(
        calculateConversationActiveDays(
          [{ startDate: "2026-01-11", endDate: null }],
          new Date("2026-01-10T12:00:00+09:00"),
        ),
      ).toBe(0);
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
  });

  describe("validateConversationParticipants", () => {
    it("accepts valid participants", () => {
      expect(
        validateConversationParticipants([
          { name: "メンバーA" },
          { name: "メンバーB" },
        ]),
      ).toBeNull();
    });

    it("rejects empty participants", () => {
      expect(validateConversationParticipants([])).toBe(
        "参加者を1人以上入力してください",
      );
    });

    it("rejects blank participant names", () => {
      expect(
        validateConversationParticipants([{ name: "   " }]),
      ).toBe("参加者名を入力してください");
    });

    it("rejects duplicate participant names", () => {
      expect(
        validateConversationParticipants([
          { name: "メンバーA" },
          { name: "メンバーA" },
        ]),
      ).toBe("参加者名が重複しています");
    });

    it("accepts participants with valid UUID id", () => {
      expect(
        validateConversationParticipants([
          { id: participantId1, name: "メンバーA" },
        ]),
      ).toBeNull();
    });

    it("rejects participants with invalid id format", () => {
      expect(
        validateConversationParticipants([
          { id: "not-a-uuid", name: "メンバーA" },
        ]),
      ).toBe("参加者IDが不正です");
    });
  });

  describe("validateParticipantsPreserveExisting", () => {
    it("accepts when all existing participants are present", () => {
      expect(
        validateParticipantsPreserveExisting(
          [
            { id: participantId1, name: "メンバーA" },
            { name: "メンバーC" },
          ],
          [participantId1],
        ),
      ).toBeNull();
    });

    it("rejects when an existing participant is missing", () => {
      expect(
        validateParticipantsPreserveExisting(
          [{ name: "メンバーC" }],
          [participantId1],
        ),
      ).toBe("既存の参加者を削除することはできません");
    });

    it("accepts when there are no existing participants", () => {
      expect(
        validateParticipantsPreserveExisting(
          [{ name: "メンバーA" }],
          [],
        ),
      ).toBeNull();
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

  describe("listConversationsWithMetadata", () => {
    it("returns conversations with active days using a batched period query", async () => {
      mockGetConversations.mockResolvedValue([
        baseConversation,
        {
          ...baseConversation,
          id: "conv-2",
          title: "別の会話",
        },
      ]);
      mockListConversationActivePeriods.mockResolvedValue([
        ...activePeriods,
        {
          id: "period-2",
          conversationId: "conv-2",
          startDate: "2026-01-20",
          endDate: "2026-01-21",
          createdAt: "2026-01-20T00:00:00Z",
        },
      ]);

      const result = await listConversationsWithMetadata(client, "user-1");

      expect(result).toEqual([
        {
          ...baseConversation,
          activeDays: 10,
        },
        {
          ...baseConversation,
          id: "conv-2",
          title: "別の会話",
          activeDays: 2,
        },
      ]);
      expect(mockListConversationActivePeriods).toHaveBeenCalledWith(client, [
        "conv-1",
        "conv-2",
      ]);
      expect(mockGetConversationParticipants).not.toHaveBeenCalled();
    });
  });

  describe("getConversationWithRecords", () => {
    it("returns conversation with metadata and records", async () => {
      mockGetConversation.mockResolvedValue(baseConversation);
      mockGetConversationActivePeriods.mockResolvedValue(activePeriods);
      mockGetConversationParticipants.mockResolvedValue(participants);
      mockGetRecordsByConversation.mockResolvedValue([baseRecord]);

      const result = await getConversationWithRecords(client, "conv-1");

      expect(result).toEqual({
        ...baseConversation,
        activePeriods,
        participants,
        activeDays: 10,
        records: [baseRecord],
      });
      expect(mockGetConversationActivePeriods).toHaveBeenCalledWith(
        client,
        "conv-1",
      );
      expect(mockGetConversationParticipants).toHaveBeenCalledWith(
        client,
        "conv-1",
      );
    });

    it("returns null when conversation not found", async () => {
      mockGetConversation.mockResolvedValue(null);

      const result = await getConversationWithRecords(client, "missing");

      expect(result).toBeNull();
      expect(mockGetConversationActivePeriods).not.toHaveBeenCalled();
      expect(mockGetConversationParticipants).not.toHaveBeenCalled();
    });
  });

  describe("getConversationWithParticipants", () => {
    it("returns conversation with participants without loading records", async () => {
      mockGetConversation.mockResolvedValue(baseConversation);
      mockGetConversationParticipants.mockResolvedValue(participants);

      const result = await getConversationWithParticipants(client, "conv-1");

      expect(result).toEqual({
        ...baseConversation,
        participants,
      });
      expect(mockGetConversationParticipants).toHaveBeenCalledWith(
        client,
        "conv-1",
      );
      expect(mockGetRecordsByConversation).not.toHaveBeenCalled();
    });

    it("returns null when conversation not found", async () => {
      mockGetConversation.mockResolvedValue(null);

      const result = await getConversationWithParticipants(client, "missing");

      expect(result).toBeNull();
      expect(mockGetConversationParticipants).not.toHaveBeenCalled();
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
          participants: [{ name: "メンバーA" }],
        }),
      ).toBeNull();
    });

    it("rejects missing participants", () => {
      expect(
        validateCreateConversationInput({
          userId: "user-1",
          title: "テスト会話",
          idolGroup: "nogizaka",
          activePeriods: [{ startDate: "2026-01-01", endDate: null }],
          participants: [],
        }),
      ).toBe("参加者を1人以上入力してください");
    });
  });

  describe("createNewConversation", () => {
    it("creates conversation with metadata", async () => {
      mockCreateConversationWithMetadata.mockResolvedValue(baseConversation);
      mockGetConversationActivePeriods.mockResolvedValue(activePeriods);
      mockGetConversationParticipants.mockResolvedValue(participants);

      const result = await createNewConversation(client, {
        userId: "user-1",
        title: "  テスト会話  ",
        idolGroup: "nogizaka",
        activePeriods: [{ startDate: "2026-01-01", endDate: "2026-01-10" }],
        participants: [{ name: "  メンバーA  " }],
      });

      expect(result.activeDays).toBe(10);
      expect(result.participants).toEqual(participants);
      expect(mockCreateConversationWithMetadata).toHaveBeenCalledWith(client, {
        userId: "user-1",
        title: "テスト会話",
        idolGroup: "nogizaka",
        sourceId: undefined,
        coverImagePath: undefined,
        activePeriods: [{ startDate: "2026-01-01", endDate: "2026-01-10" }],
        participants: [{ name: "メンバーA", thumbnailPath: null }],
      });
      expect(mockGetConversationParticipants).toHaveBeenCalledWith(
        client,
        "conv-1",
      );
    });
  });

  describe("validateUpdateConversationInput", () => {
    it("returns null for valid input", () => {
      expect(
        validateUpdateConversationInput({
          participants: [{ name: "メンバーA" }],
        }),
      ).toBeNull();
    });

    it("rejects empty update input", () => {
      expect(validateUpdateConversationInput({})).toBe(
        "更新項目を指定してください",
      );
    });
  });

  describe("updateExistingConversation", () => {
    it("updates conversation with participants preserving existing IDs", async () => {
      const existingParticipants: ConversationParticipant[] = [
        {
          ...participants[0],
          thumbnailPath: "user-1/participants/member-a/photo.jpg",
        },
        {
          id: participantId2,
          conversationId: "conv-1",
          name: "メンバーB",
          sortOrder: 1,
          thumbnailPath: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ];
      mockGetConversationParticipants.mockResolvedValue(existingParticipants);
      mockUpdateConversationWithMetadata.mockResolvedValue(baseConversation);
      mockGetConversationActivePeriods.mockResolvedValue(activePeriods);

      const result = await updateExistingConversation(client, "conv-1", {
        participants: [
          { id: participantId1, name: "メンバーA" },
          { id: participantId2, name: " メンバーB " },
        ],
      });

      expect(result.participants).toHaveLength(2);
      expect(mockUpdateConversationWithMetadata).toHaveBeenCalledWith(
        client,
        "conv-1",
        {
          title: undefined,
          idolGroup: undefined,
          sourceId: undefined,
          coverImagePath: undefined,
          activePeriods: undefined,
          participants: [
            {
              id: participantId1,
              name: "メンバーA",
              thumbnailPath: "user-1/participants/member-a/photo.jpg",
            },
            { id: participantId2, name: "メンバーB", thumbnailPath: null },
          ],
        },
      );
      expect(mockUpdateConversation).not.toHaveBeenCalled();
    });

    it("rejects removing existing participants", async () => {
      mockGetConversationParticipants.mockResolvedValue(participants);

      await expect(
        updateExistingConversation(client, "conv-1", {
          participants: [{ name: "メンバーC" }],
        }),
      ).rejects.toThrow("既存の参加者を削除することはできません");

      expect(mockUpdateConversationWithMetadata).not.toHaveBeenCalled();
    });

    it("allows adding new participants alongside existing ones", async () => {
      mockGetConversationParticipants.mockResolvedValue(participants);
      mockUpdateConversationWithMetadata.mockResolvedValue(baseConversation);
      mockGetConversationActivePeriods.mockResolvedValue(activePeriods);

      const result = await updateExistingConversation(client, "conv-1", {
        participants: [
          { id: participantId1, name: "メンバーA" },
          { name: "メンバーC" },
        ],
      });

      expect(result.participants).toHaveLength(1);
      expect(mockUpdateConversationWithMetadata).toHaveBeenCalledWith(
        client,
        "conv-1",
        {
          title: undefined,
          idolGroup: undefined,
          sourceId: undefined,
          coverImagePath: undefined,
          activePeriods: undefined,
          participants: [
            { id: participantId1, name: "メンバーA", thumbnailPath: null },
            { id: undefined, name: "メンバーC", thumbnailPath: null },
          ],
        },
      );
    });

    it("uses plain conversation update when metadata only", async () => {
      mockUpdateConversation.mockResolvedValue(baseConversation);
      mockGetConversationActivePeriods.mockResolvedValue(activePeriods);
      mockGetConversationParticipants.mockResolvedValue(participants);

      const result = await updateExistingConversation(client, "conv-1", {
        coverImagePath: null,
      });

      expect(result.participants).toEqual(participants);
      expect(mockUpdateConversation).toHaveBeenCalledWith(client, "conv-1", {
        title: undefined,
        idolGroup: undefined,
        sourceId: undefined,
        coverImagePath: null,
      });
      expect(mockUpdateConversationWithMetadata).not.toHaveBeenCalled();
    });
  });

  describe("deleteExistingConversation", () => {
    it("deletes conversation via repository", async () => {
      mockDeleteConversation.mockResolvedValue(undefined);

      await deleteExistingConversation(client, "conv-1");

      expect(mockDeleteConversation).toHaveBeenCalledWith(client, "conv-1");
    });
  });

  describe("getConversationCoverUrls", () => {
    it("returns conversation ids mapped to signed cover URLs", async () => {
      mockGetFileUrls.mockResolvedValue(
        new Map([["user-1/participants/member-a/photo.jpg", "https://example.com/cover"]]),
      );

      const result = await getConversationCoverUrls(client, [
        {
          ...baseConversation,
          coverImagePath: "user-1/participants/member-a/photo.jpg",
        },
        {
          ...baseConversation,
          id: "conv-2",
          coverImagePath: "/images/local.jpg",
        },
      ]);

      expect(result.get("conv-1")).toBe("https://example.com/cover");
      expect(result.has("conv-2")).toBe(false);
      expect(mockGetFileUrls).toHaveBeenCalledWith(client, [
        "user-1/participants/member-a/photo.jpg",
      ]);
    });
  });

  describe("getParticipantThumbnailUrls", () => {
    it("returns participant ids mapped to signed thumbnail URLs", async () => {
      mockGetFileUrls.mockResolvedValue(
        new Map([["user-1/participants/member-a/photo.jpg", "https://example.com/member"]]),
      );

      const result = await getParticipantThumbnailUrls(client, [
        {
          ...participants[0],
          thumbnailPath: "user-1/participants/member-a/photo.jpg",
        },
      ]);

      expect(result.get(participantId1)).toBe("https://example.com/member");
      expect(mockGetFileUrls).toHaveBeenCalledWith(client, [
        "user-1/participants/member-a/photo.jpg",
      ]);
    });
  });

  describe("updateParticipantThumbnailImage", () => {
    it("uploads thumbnail and updates participant path", async () => {
      const file = new Blob(["image"], { type: "image/jpeg" });
      mockUploadFile.mockResolvedValue(
        "user-1/participants/participant-1/photo.jpg",
      );
      mockUpdateConversationParticipantThumbnail.mockResolvedValue({
        ...participants[0],
        id: "participant-1",
        thumbnailPath: "user-1/participants/participant-1/photo.jpg",
      });

      const result = await updateParticipantThumbnailImage(client, {
        userId: "user-1",
        conversationId: "conv-1",
        participantId: "participant-1",
        file,
        filename: "photo.jpg",
        contentType: "image/jpeg",
        useAsConversationCover: true,
      });

      expect(result.thumbnailPath).toBe(
        "user-1/participants/participant-1/photo.jpg",
      );
      expect(mockUploadFile).toHaveBeenCalledWith(client, {
        path: "user-1/participants/participant-1/photo.jpg",
        file,
        contentType: "image/jpeg",
        upsert: true,
      });
      expect(mockUpdateConversationParticipantThumbnail).toHaveBeenCalledWith(
        client,
        {
          conversationId: "conv-1",
          participantId: "participant-1",
          thumbnailPath: "user-1/participants/participant-1/photo.jpg",
        },
      );
      expect(mockUpdateConversation).toHaveBeenCalledWith(client, "conv-1", {
        coverImagePath: "user-1/participants/participant-1/photo.jpg",
      });
    });
  });

  describe("updateConversationCoverImage", () => {
    it("uploads cover image and updates conversation cover path", async () => {
      const file = new Blob(["image"], { type: "image/jpeg" });
      mockUploadFile.mockResolvedValue(
        "user-1/conversations/conv-1/cover/cover.jpg",
      );
      mockUpdateConversation.mockResolvedValue({
        ...baseConversation,
        coverImagePath: "user-1/conversations/conv-1/cover/cover.jpg",
      });

      const result = await updateConversationCoverImage(client, {
        userId: "user-1",
        conversationId: "conv-1",
        file,
        filename: "cover.jpg",
        contentType: "image/jpeg",
      });

      expect(result.coverImagePath).toBe(
        "user-1/conversations/conv-1/cover/cover.jpg",
      );
      expect(mockUploadFile).toHaveBeenCalledWith(client, {
        path: "user-1/conversations/conv-1/cover/cover.jpg",
        file,
        contentType: "image/jpeg",
        upsert: true,
      });
      expect(mockUpdateConversation).toHaveBeenCalledWith(client, "conv-1", {
        coverImagePath: "user-1/conversations/conv-1/cover/cover.jpg",
      });
    });
  });
});
