import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({
  login: vi.fn(),
}));

describe("LoginPage", () => {
  it("renders the login form with all fields", async () => {
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    expect(screen.getByText("トークアーカイブ")).toBeInTheDocument();
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
