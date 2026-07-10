import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/lib/brand";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("renders the light brand asset without a theme branch", () => {
    render(<BrandLogo />);

    const image = screen.getByRole("img", { name: APP_NAME });

    expect(image.getAttribute("src")).toContain("header.png");
    expect(image).toHaveAttribute("width", "2172");
    expect(image).toHaveAttribute("height", "724");
    expect(document.querySelector("picture")).not.toBeInTheDocument();
    expect(document.querySelector("source")).not.toBeInTheDocument();
  });
});
