import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddImageRecordForm } from "./AddImageRecordForm";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  addImageRecordAction: vi.fn(),
}));

describe("AddImageRecordForm", () => {
  it("renders all form fields", () => {
    render(<AddImageRecordForm conversationId="conv-1" />);

    expect(screen.getByLabelText("タイトル（任意）")).toBeInTheDocument();
    expect(screen.getByLabelText("テキスト（任意）")).toBeInTheDocument();
    expect(screen.getByLabelText("画像ファイル")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "画像を追加" }),
    ).toBeInTheDocument();
  });

  it("has title and content inputs as optional", () => {
    render(<AddImageRecordForm conversationId="conv-1" />);

    expect(screen.getByLabelText("タイトル（任意）")).not.toBeRequired();
    expect(screen.getByLabelText("テキスト（任意）")).not.toBeRequired();
  });

  it("has file input as required with image accept", () => {
    render(<AddImageRecordForm conversationId="conv-1" />);

    const fileInput = screen.getByLabelText("画像ファイル");
    expect(fileInput).toBeRequired();
    expect(fileInput).toHaveAttribute("accept", "image/*");
    expect(fileInput).toHaveAttribute("type", "file");
  });
});
