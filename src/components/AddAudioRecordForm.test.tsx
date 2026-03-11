import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddAudioRecordForm } from "./AddAudioRecordForm";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  addAudioRecordAction: vi.fn(),
}));

describe("AddAudioRecordForm", () => {
  it("renders all form fields", () => {
    render(<AddAudioRecordForm conversationId="conv-1" />);

    expect(screen.getByLabelText("タイトル（任意）")).toBeInTheDocument();
    expect(screen.getByLabelText("音声ファイル")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "音声を追加" }),
    ).toBeInTheDocument();
  });

  it("has file input as required with audio accept", () => {
    render(<AddAudioRecordForm conversationId="conv-1" />);

    const fileInput = screen.getByLabelText("音声ファイル");
    expect(fileInput).toBeRequired();
    expect(fileInput).toHaveAttribute("accept", "audio/*");
    expect(fileInput).toHaveAttribute("type", "file");
  });

  it("has title input as optional", () => {
    render(<AddAudioRecordForm conversationId="conv-1" />);

    expect(screen.getByLabelText("タイトル（任意）")).not.toBeRequired();
  });
});
