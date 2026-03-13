import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

vi.mock("@/app/login/actions", () => ({
  logout: vi.fn(),
}));

describe("Sidebar", () => {
  it("renders app title as link to home", () => {
    render(<Sidebar userEmail="test@example.com" />);

    const titleLink = screen.getByRole("link", { name: "トークアーカイブ" });
    expect(titleLink).toHaveAttribute("href", "/");
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
});
