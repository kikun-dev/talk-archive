import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsForm } from "./SettingsForm";

vi.mock("@/app/(app)/settings/actions", () => ({
  updateDisplayNameAction: vi.fn(),
}));

describe("SettingsForm", () => {
  it("renders form with current display name", () => {
    render(<SettingsForm currentDisplayName="太郎" />);

    expect(screen.getByLabelText("名前")).toHaveValue("太郎");
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("renders form with empty display name", () => {
    render(<SettingsForm currentDisplayName="" />);

    expect(screen.getByLabelText("名前")).toHaveValue("");
    expect(
      screen.getByPlaceholderText("名前を入力"),
    ).toBeInTheDocument();
  });

  it("has maxLength attribute on input", () => {
    render(<SettingsForm currentDisplayName="" />);

    expect(screen.getByLabelText("名前")).toHaveAttribute("maxLength", "50");
  });
});
