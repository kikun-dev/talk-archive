import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ConversationSummary } from "@/usecases/conversationUseCases";

const createSupabaseServerClientMock = vi.fn();
const listConversationsWithMetadataMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/usecases/conversationUseCases", () => ({
  listConversationsWithMetadata: listConversationsWithMetadataMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const baseConversation: ConversationSummary = {
  id: "conv-1",
  userId: "user-1",
  sourceId: null,
  title: "テスト会話",
  idolGroup: "nogizaka",
  coverImagePath: null,
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-01-20T00:00:00Z",
  activeDays: 100,
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

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when user is not available", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: HomePage } = await import("./page");

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(listConversationsWithMetadataMock).not.toHaveBeenCalled();
  });

  it("loads and renders conversations for the authenticated user", async () => {
    mockSupabaseUser({ id: "user-1" });
    listConversationsWithMetadataMock.mockResolvedValue([baseConversation]);

    const { default: HomePage } = await import("./page");
    render(await HomePage());

    expect(listConversationsWithMetadataMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
    );
    expect(
      screen.getByRole("heading", { name: "会話一覧" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "新規作成" }),
    ).toHaveAttribute("href", "/conversations/new");
    expect(
      screen.getByRole("link", { name: /テスト会話/ }),
    ).toHaveAttribute("href", "/conversations/conv-1");
  });
});
