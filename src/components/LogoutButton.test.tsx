import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogoutButton } from "./LogoutButton";

const { logoutMock, useActionStateMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: useActionStateMock,
  };
});

vi.mock("@/app/login/actions", () => ({
  logout: logoutMock,
}));

describe("LogoutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReturnValue([undefined, vi.fn(), false]);
  });

  it("renders logout button", () => {
    render(<LogoutButton />);

    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
  });

  it("shows error message when action state contains error", () => {
    useActionStateMock.mockReturnValue([
      {
        error: "ログアウトに失敗しました。時間をおいて再度お試しください。",
      },
      vi.fn(),
      false,
    ]);

    render(<LogoutButton />);

    expect(
      screen.getByText(
        "ログアウトに失敗しました。時間をおいて再度お試しください。",
      ),
    ).toBeInTheDocument();
  });
});
