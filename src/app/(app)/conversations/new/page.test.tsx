import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Source } from "@/types/domain";

const createSupabaseServerClientMock = vi.fn();
const listSourcesMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/usecases/sourceUseCases", () => ({
  listSources: listSourcesMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const sources: Source[] = [
  {
    id: "src-1",
    userId: "user-1",
    name: "LINE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

function mockSupabaseUser(user: { id: string } | null) {
  createSupabaseServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  });
}

describe("NewConversationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when user is not available", async () => {
    mockSupabaseUser(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: NewConversationPage } = await import("./page");

    await expect(NewConversationPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(listSourcesMock).not.toHaveBeenCalled();
  });

  it("loads sources via usecase and renders the form", async () => {
    mockSupabaseUser({ id: "user-1" });
    listSourcesMock.mockResolvedValue(sources);

    const { default: NewConversationPage } = await import("./page");
    render(await NewConversationPage());

    expect(listSourcesMock).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(
      screen.getByRole("heading", { name: "新しい会話" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("タイトル")).toBeInTheDocument();
    expect(screen.getByText("LINE")).toBeInTheDocument();
  });
});
