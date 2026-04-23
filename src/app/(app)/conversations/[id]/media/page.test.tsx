import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ConversationWithParticipants } from "@/usecases/conversationUseCases";
import type { Record } from "@/types/domain";
import type { MediaUrl } from "@/usecases/recordUseCases";

const createSupabaseServerClientMock = vi.fn();
const getConversationWithParticipantsMock = vi.fn();
const listMediaRecordsByConversationMock = vi.fn();
const getMediaUrlsForRecordsMock = vi.fn();
const redirectMock = vi.fn();
const notFoundMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/usecases/conversationUseCases", () => ({
  getConversationWithParticipants: getConversationWithParticipantsMock,
}));

vi.mock("@/usecases/recordUseCases", () => ({
  listMediaRecordsByConversation: listMediaRecordsByConversationMock,
  getMediaUrlsForRecords: getMediaUrlsForRecordsMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));

const baseConversation: ConversationWithParticipants = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  idolGroup: "nogizaka",
  coverImagePath: null,
  title: "テスト会話",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  participants: [
    {
      id: "part-1",
      conversationId: "conv-1",
      name: "メンバーA",
      sortOrder: 0,
      thumbnailPath: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
};

const mediaRecord: Record = {
  id: "rec-img-1",
  conversationId: "conv-1",
  recordType: "image",
  title: "写真タイトル",
  content: null,
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-01T10:00:00+09:00",
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function mockSupabaseUser(user: { id: string } | null) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  });
}

describe("ConversationMediaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversationWithParticipantsMock.mockResolvedValue(baseConversation);
    listMediaRecordsByConversationMock.mockResolvedValue([mediaRecord]);
    getMediaUrlsForRecordsMock.mockResolvedValue(
      new Map<string, MediaUrl>([
        [
          "rec-img-1",
          { url: "https://example.com/img.jpg", mimeType: "image/jpeg" },
        ],
      ]),
    );
  });

  it("redirects to /login when user is not available", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: ConversationMediaPage } = await import("./page");

    await expect(
      ConversationMediaPage({
        params: Promise.resolve({ id: "conv-1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getConversationWithParticipantsMock).not.toHaveBeenCalled();
  });

  it("loads participants and media records without fetching all records", async () => {
    mockSupabaseUser({ id: "user-1" });

    const { default: ConversationMediaPage } = await import("./page");
    render(
      await ConversationMediaPage({
        params: Promise.resolve({ id: "conv-1" }),
      }),
    );

    expect(getConversationWithParticipantsMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
    );
    expect(listMediaRecordsByConversationMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
    );
    expect(getMediaUrlsForRecordsMock).toHaveBeenCalledWith(
      expect.anything(),
      [mediaRecord],
    );
    expect(screen.getByText("写真タイトル")).toBeInTheDocument();
  });
});
