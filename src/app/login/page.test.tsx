import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { APP_DESCRIPTION_LINES, APP_NAME } from "@/lib/brand";

vi.mock("./actions", () => ({
  login: vi.fn(),
}));

describe("LoginPage", () => {
  it("renders the login form with all fields", async () => {
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: APP_NAME }),
    ).toBeInTheDocument();
    // ログインのロゴは max-w-xs（320px）で表示されるため、sizes も 320px を通知する
    expect(screen.getByRole("img", { name: APP_NAME })).toHaveAttribute(
      "sizes",
      "320px",
    );
    expect(APP_DESCRIPTION_LINES).toEqual([
      "坂道メンバーから届いた言葉と時間を残す",
      "私だけの記録帖。",
    ]);
    for (const line of APP_DESCRIPTION_LINES) {
      expect(screen.getByText(line)).toHaveClass("block");
    }
    expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ログイン" }),
    ).toBeInTheDocument();
  });

  it("has correct input types", async () => {
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    const emailInput = screen.getByLabelText("メールアドレス");
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toBeRequired();

    const passwordInput = screen.getByLabelText("パスワード");
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toBeRequired();
  });
});
