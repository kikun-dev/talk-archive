import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkifiedText } from "./LinkifiedText";

describe("LinkifiedText", () => {
  it("renders plain text without a URL as-is", () => {
    const { container } = render(<LinkifiedText text="こんにちは" />);

    expect(container.textContent).toBe("こんにちは");
    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("renders a URL as an anchor with target and rel attributes", () => {
    render(<LinkifiedText text="見て https://example.com すごい" />);

    const link = screen.getByRole("link", { name: "https://example.com" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders surrounding text alongside the link", () => {
    const { container } = render(
      <LinkifiedText text="見て https://example.com すごい" />,
    );

    expect(container.textContent).toBe("見て https://example.com すごい");
  });

  it("renders multiple links", () => {
    render(
      <LinkifiedText text="https://example.com と https://example.org を見て" />,
    );

    expect(
      screen.getByRole("link", { name: "https://example.com" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://example.org" }),
    ).toBeInTheDocument();
  });

  it("keeps trailing punctuation out of the link", () => {
    const { container } = render(
      <LinkifiedText text="詳細はhttps://example.com。" />,
    );

    const link = screen.getByRole("link", { name: "https://example.com" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(container.textContent).toBe("詳細はhttps://example.com。");
  });
});
