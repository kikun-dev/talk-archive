import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormError } from "./FormError";

describe("FormError", () => {
  it("renders nothing when message is undefined", () => {
    const { container } = render(<FormError />);
    expect(container.firstElementChild).toBeNull();
  });

  it("renders nothing when message is empty string", () => {
    const { container } = render(<FormError message="" />);
    expect(container.firstElementChild).toBeNull();
  });

  it("renders alert with message", () => {
    render(<FormError message="エラーが発生しました" />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain("エラーが発生しました");
  });
});
