import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const createSupabaseServerClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/app/login/actions", () => ({
  logout: vi.fn(),
}));

describe("AppLayout", () => {
  it("locks the app shell to the viewport and lets main scroll internally", async () => {
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: "test@example.com" } },
        }),
      },
    });

    const { default: AppLayout } = await import("./layout");
    const { container } = render(
      await AppLayout({
        children: <div>content</div>,
      }),
    );

    const appShell = container.firstElementChild;
    expect(appShell).toHaveClass("h-dvh", "overflow-hidden");
    expect(appShell).not.toHaveClass("min-h-screen");

    const main = screen.getByText("content").closest("main");
    expect(main).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
  });
});
