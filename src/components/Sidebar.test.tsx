import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

vi.mock("@/app/login/actions", () => ({
  logout: vi.fn(),
}));

describe("Sidebar", () => {
  it("renders app title as link to home", () => {
    render(<Sidebar userEmail="test@example.com" />);

    const titleLinks = screen.getAllByRole("link", { name: "トークアーカイブ" });
    expect(titleLinks).toHaveLength(2);
    for (const titleLink of titleLinks) {
      expect(titleLink).toHaveAttribute("href", "/");
    }
  });

  it("renders navigation link for conversations", () => {
    render(<Sidebar userEmail="test@example.com" />);

    const navLink = screen.getByRole("link", { name: "会話一覧" });
    expect(navLink).toHaveAttribute("href", "/");
  });

  it("renders navigation link for search", () => {
    render(<Sidebar userEmail="test@example.com" />);

    const navLink = screen.getByRole("link", { name: "検索" });
    expect(navLink).toHaveAttribute("href", "/search");
  });

  it("displays user email", () => {
    render(<Sidebar userEmail="test@example.com" />);

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("renders logout button", () => {
    render(<Sidebar userEmail="test@example.com" />);

    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
  });

  it("toggles mobile navigation drawer", () => {
    render(<Sidebar userEmail="test@example.com" />);

    const toggleButton = screen.getByRole("button", {
      name: "ナビゲーションを開く",
    });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggleButton);

    const dialog = screen.getByRole("dialog", { name: "ナビゲーション" });
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText("メニュー")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "ナビゲーション" })).toBeNull();
  });
});
