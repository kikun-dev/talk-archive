import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders with default classes", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild!;
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("bg-gray-200");
    expect(el.className).toContain("rounded");
  });

  it("applies additional className", () => {
    const { container } = render(<Skeleton className="h-8 w-32" />);
    const el = container.firstElementChild!;
    expect(el.className).toContain("h-8");
    expect(el.className).toContain("w-32");
  });

  it("is hidden from accessibility tree", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild!;
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});
