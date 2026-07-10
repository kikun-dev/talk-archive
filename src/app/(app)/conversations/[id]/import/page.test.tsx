import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ConversationWithParticipants } from "@/usecases/conversationUseCases";

const createSupabaseServerClientMock = vi.fn();
const getConversationWithParticipantsMock = vi.fn();
const redirectMock = vi.fn();
const notFoundMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/usecases/conversationUseCases", () => ({
  getConversationWithParticipants: getConversationWithParticipantsMock,
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

function mockSupabaseUser(user: { id: string } | null) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  });
}

describe("ConversationImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversationWithParticipantsMock.mockResolvedValue(baseConversation);
  });

  it("redirects to /login when user is not available", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: ConversationImportPage } = await import("./page");

    await expect(
      ConversationImportPage({
        params: Promise.resolve({ id: "conv-1" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(getConversationWithParticipantsMock).not.toHaveBeenCalled();
  });

  it("calls notFound when the conversation does not exist", async () => {
    mockSupabaseUser({ id: "user-1" });
    getConversationWithParticipantsMock.mockResolvedValue(null);
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    const { default: ConversationImportPage } = await import("./page");

    await expect(
      ConversationImportPage({
        params: Promise.resolve({ id: "conv-1" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the import form with participants", async () => {
    mockSupabaseUser({ id: "user-1" });

    const { default: ConversationImportPage } = await import("./page");
    render(
      await ConversationImportPage({
        params: Promise.resolve({ id: "conv-1" }),
      }),
    );

    expect(getConversationWithParticipantsMock).toHaveBeenCalledWith(
      expect.anything(),
      "conv-1",
    );
    expect(
      screen.getByLabelText("インポートするJSONファイル"),
    ).toBeInTheDocument();
  });

  it("builds metadata title from the conversation title", async () => {
    mockSupabaseUser({ id: "user-1" });

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "conv-1" }),
    });

    expect(metadata.title).toBe("インポート - テスト会話");
  });

  it("falls back to the app name in metadata when the conversation is missing", async () => {
    getConversationWithParticipantsMock.mockResolvedValue(null);

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "conv-1" }),
    });

    expect(metadata.title).toEqual({ absolute: expect.any(String) });
  });
});
