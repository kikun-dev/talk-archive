import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatComposer } from "./ChatComposer";
import type { ConversationParticipant } from "@/types/domain";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  addTextRecordAction: vi.fn(),
  addImageRecordAction: vi.fn(),
  addVideoRecordAction: vi.fn(),
  addAudioRecordAction: vi.fn(),
}));

const twoParticipants: ConversationParticipant[] = [
  {
    id: "part-1",
    conversationId: "conv-1",
    name: "メンバーA",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "part-2",
    conversationId: "conv-1",
    name: "メンバーB",
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const singleParticipant: ConversationParticipant[] = [twoParticipants[0]];

describe("ChatComposer", () => {
  it("renders type tabs", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={twoParticipants}
      />,
    );

    expect(screen.getByText("テキスト")).toBeInTheDocument();
    expect(screen.getByText("画像")).toBeInTheDocument();
    expect(screen.getByText("動画")).toBeInTheDocument();
    expect(screen.getByText("音声")).toBeInTheDocument();
  });

  it("shows speaker selector when multiple participants", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={twoParticipants}
      />,
    );

    expect(screen.getByText("発言者を選択")).toBeInTheDocument();
    expect(screen.getByText("メンバーA")).toBeInTheDocument();
    expect(screen.getByText("メンバーB")).toBeInTheDocument();
  });

  it("uses equal width fields for speaker and postedAt when multiple participants", () => {
    const { container } = render(
      <ChatComposer
        conversationId="conv-1"
        participants={twoParticipants}
      />,
    );

    const select = screen.getByRole("combobox");
    const datetimeInput = container.querySelector(
      'input[name="postedAt"]',
    );

    expect(select.parentElement).toHaveClass("flex-1");
    expect(datetimeInput?.parentElement).toHaveClass("flex-1");
  });

  it("hides speaker selector when single participant", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={singleParticipant}
      />,
    );

    expect(screen.queryByText("発言者を選択")).not.toBeInTheDocument();
  });

  it("shows text-specific fields on text tab", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={singleParticipant}
      />,
    );

    expect(
      screen.getByPlaceholderText("メッセージを入力"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("タイトル（任意）"),
    ).toBeInTheDocument();
  });

  it("shows image-specific fields on image tab", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={singleParticipant}
      />,
    );

    fireEvent.click(screen.getByText("画像"));

    expect(
      screen.getByPlaceholderText("テキスト（任意）"),
    ).toBeInTheDocument();
  });

  it("shows video-specific fields on video tab", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={singleParticipant}
      />,
    );

    fireEvent.click(screen.getByText("動画"));

    expect(screen.getByText("音声あり")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("タイトル（任意）"),
    ).not.toBeInTheDocument();
  });

  it("does not show title field on audio tab", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={singleParticipant}
      />,
    );

    fireEvent.click(screen.getByText("音声"));

    expect(
      screen.queryByPlaceholderText("タイトル（任意）"),
    ).not.toBeInTheDocument();
  });

  it("shows postedAt input", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={singleParticipant}
      />,
    );

    const dateInputs = screen.getAllByDisplayValue("");
    const datetimeInput = dateInputs.find(
      (el) => el.getAttribute("type") === "datetime-local",
    );
    expect(datetimeInput).toBeInTheDocument();
  });

  it("has submit button", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={singleParticipant}
      />,
    );

    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("stacks primary fields on mobile and switches to row layout on larger screens", () => {
    render(
      <ChatComposer
        conversationId="conv-1"
        participants={twoParticipants}
      />,
    );

    expect(screen.getByTestId("composer-primary-fields")).toHaveClass(
      "flex-col",
      "sm:flex-row",
    );
  });
});
