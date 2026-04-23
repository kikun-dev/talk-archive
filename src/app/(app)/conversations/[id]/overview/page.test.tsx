import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ConversationWithRecords } from "@/usecases/conversationUseCases";
import { ToastProvider } from "@/components/ToastProvider";

const createSupabaseServerClientMock = vi.fn();
const getConversationWithRecordsMock = vi.fn();
const getParticipantThumbnailUrlsMock = vi.fn();
const getConversationCoverUrlsMock = vi.fn();
const redirectMock = vi.fn();
const notFoundMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/usecases/conversationUseCases", () => ({
  getConversationWithRecords: getConversationWithRecordsMock,
  getParticipantThumbnailUrls: getParticipantThumbnailUrlsMock,
  getConversationCoverUrls: getConversationCoverUrlsMock,
}));

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  updateConversationAction: vi.fn(),
  deleteConversationAction: vi.fn(),
  updateParticipantThumbnailAction: vi.fn(),
  updateConversationCoverImageAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));

const conversation: ConversationWithRecords = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  idolGroup: "nogizaka",
  coverImagePath: "user-1/participants/part-1/photo.jpg",
  title: "テスト会話",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  activePeriods: [
    {
      id: "period-1",
      conversationId: "conv-1",
      startDate: "2026-01-01",
      endDate: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  participants: [
    {
      id: "part-1",
      conversationId: "conv-1",
      name: "メンバーA",
      sortOrder: 0,
      thumbnailPath: "user-1/participants/part-1/photo.jpg",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  activeDays: 1,
  records: [],
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

describe("ConversationOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversationWithRecordsMock.mockResolvedValue(conversation);
    getParticipantThumbnailUrlsMock.mockResolvedValue(
      new Map([["part-1", "https://example.com/member-a.jpg"]]),
    );
    getConversationCoverUrlsMock.mockResolvedValue(
      new Map([["conv-1", "https://example.com/cover.jpg"]]),
    );
  });

  it("redirects to /login when user is not available", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: ConversationOverviewPage } = await import("./page");

    await expect(
      ConversationOverviewPage({
        params: Promise.resolve({ id: "conv-1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getConversationWithRecordsMock).not.toHaveBeenCalled();
  });

  it("renders thumbnail manager with signed thumbnail URLs", async () => {
    mockSupabaseUser({ id: "user-1" });

    const { default: ConversationOverviewPage } = await import("./page");
    render(
      <ToastProvider>
        {await ConversationOverviewPage({
          params: Promise.resolve({ id: "conv-1" }),
        })}
      </ToastProvider>,
    );

    expect(getParticipantThumbnailUrlsMock).toHaveBeenCalledWith(
      expect.anything(),
      conversation.participants,
    );
    expect(getConversationCoverUrlsMock).toHaveBeenCalledWith(
      expect.anything(),
      [conversation],
    );
    expect(screen.getByText("サムネイル")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "メンバーAのサムネイル" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("メンバーAのサムネイル画像"),
    ).toBeInTheDocument();
  });
});
