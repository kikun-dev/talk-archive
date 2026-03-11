import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddVideoRecordForm } from "./AddVideoRecordForm";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  addVideoRecordAction: vi.fn(),
}));

describe("AddVideoRecordForm", () => {
  it("renders all form fields", () => {
    render(<AddVideoRecordForm conversationId="conv-1" />);

    expect(screen.getByLabelText("タイトル（任意）")).toBeInTheDocument();
    expect(screen.getByLabelText("動画ファイル")).toBeInTheDocument();
    expect(screen.getByLabelText("音声あり")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "動画を追加" }),
    ).toBeInTheDocument();
  });

  it("has file input as required with video accept", () => {
    render(<AddVideoRecordForm conversationId="conv-1" />);

    const fileInput = screen.getByLabelText("動画ファイル");
    expect(fileInput).toBeRequired();
    expect(fileInput).toHaveAttribute("accept", "video/*");
    expect(fileInput).toHaveAttribute("type", "file");
  });

  it("has hasAudio checkbox checked by default", () => {
    render(<AddVideoRecordForm conversationId="conv-1" />);

    const checkbox = screen.getByLabelText("音声あり");
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAttribute("type", "checkbox");
  });

  it("has title input as optional", () => {
    render(<AddVideoRecordForm conversationId="conv-1" />);

    expect(screen.getByLabelText("タイトル（任意）")).not.toBeRequired();
  });
});
