import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddTextRecordForm } from "./AddTextRecordForm";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  addTextRecordAction: vi.fn(),
}));

describe("AddTextRecordForm", () => {
  it("renders all form fields", () => {
    render(<AddTextRecordForm conversationId="conv-1" />);

    expect(screen.getByLabelText("タイトル（任意）")).toBeInTheDocument();
    expect(screen.getByLabelText("テキスト")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("has title input as optional", () => {
    render(<AddTextRecordForm conversationId="conv-1" />);

    const titleInput = screen.getByLabelText("タイトル（任意）");
    expect(titleInput).not.toBeRequired();
  });

  it("has content textarea as required", () => {
    render(<AddTextRecordForm conversationId="conv-1" />);

    const contentInput = screen.getByLabelText("テキスト");
    expect(contentInput).toBeRequired();
    expect(contentInput.tagName).toBe("TEXTAREA");
  });
});
