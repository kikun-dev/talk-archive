import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ConversationWithParticipants } from "@/usecases/conversationUseCases";
import type { Record } from "@/types/domain";

const createSupabaseServerClientMock = vi.fn();
const getConversationWithParticipantsMock = vi.fn();
const getRecordsByDateMock = vi.fn();
const validateDateSearchInputMock = vi.fn();
const redirectMock = vi.fn();
const notFoundMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/usecases/conversationUseCases", () => ({
  getConversationWithParticipants: getConversationWithParticipantsMock,
}));

vi.mock("@/usecases/recordUseCases", () => ({
  getRecordsByDate: getRecordsByDateMock,
  validateDateSearchInput: validateDateSearchInputMock,
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
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
};

const baseRecord: Record = {
  id: "rec-1",
  conversationId: "conv-1",
  recordType: "text",
  title: null,
  content: "テストメッセージ",
  hasAudio: false,
  speakerParticipantId: "part-1",
  postedAt: "2026-01-01T12:00:00Z",
  position: 0,
  createdAt: "2026-01-01T12:00:00Z",
  updatedAt: "2026-01-01T12:00:00Z",
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

describe("ConversationDateSearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversationWithParticipantsMock.mockResolvedValue(baseConversation);
    getRecordsByDateMock.mockResolvedValue([baseRecord]);
    validateDateSearchInputMock.mockReturnValue(null);
  });

  it("redirects to /login when user is not available", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: ConversationDateSearchPage } = await import("./page");

    await expect(
      ConversationDateSearchPage({
        params: Promise.resolve({ id: "conv-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getConversationWithParticipantsMock).not.toHaveBeenCalled();
  });

  it("shows validation message for invalid date without querying records", async () => {
    mockSupabaseUser({ id: "user-1" });
    validateDateSearchInputMock.mockReturnValue("日付の形式が不正です");

    const { default: ConversationDateSearchPage } = await import("./page");
    render(
      await ConversationDateSearchPage({
        params: Promise.resolve({ id: "conv-1" }),
        searchParams: Promise.resolve({ date: "2026-02-30" }),
      }),
    );

    expect(validateDateSearchInputMock).toHaveBeenCalledWith("2026-02-30");
    expect(getRecordsByDateMock).not.toHaveBeenCalled();
    expect(screen.getByText("日付の形式が不正です")).toBeInTheDocument();
  });

  it("loads only conversation participants and date-matched records", async () => {
    mockSupabaseUser({ id: "user-1" });

    const { default: ConversationDateSearchPage } = await import("./page");
    render(
      await ConversationDateSearchPage({
        params: Promise.resolve({ id: "conv-1" }),
        searchParams: Promise.resolve({ date: "2026-01-01" }),
      }),
    );

    expect(getConversationWithParticipantsMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
    );
    expect(getRecordsByDateMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
      "2026-01-01",
    );
    expect(screen.getByText("1件のレコード")).toBeInTheDocument();
  });
});
