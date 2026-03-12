import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ParticipantFields } from "./ParticipantFields";
import type { ConversationParticipantInput } from "@/usecases/conversationUseCases";

describe("ParticipantFields", () => {
  it("renders empty state when no participants", () => {
    render(<ParticipantFields participants={[]} onChange={vi.fn()} />);

    expect(screen.getByText("参加者を追加してください")).toBeInTheDocument();
  });

  it("renders participant inputs", () => {
    const participants: ConversationParticipantInput[] = [{ name: "メンバーA" }];

    render(
      <ParticipantFields participants={participants} onChange={vi.fn()} />,
    );

    expect(screen.getByDisplayValue("メンバーA")).toBeInTheDocument();
  });

  it("adds a participant", () => {
    const onChange = vi.fn();

    render(
      <ParticipantFields
        participants={[{ name: "メンバーA" }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText("+ 参加者を追加"));

    expect(onChange).toHaveBeenCalledWith([
      { name: "メンバーA" },
      { name: "" },
    ]);
  });

  it("removes a new participant", () => {
    const onChange = vi.fn();

    render(
      <ParticipantFields
        participants={[{ name: "メンバーA" }, { name: "メンバーB" }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getAllByText("削除")[0]);

    expect(onChange).toHaveBeenCalledWith([{ name: "メンバーB" }]);
  });

  it("updates a participant name", () => {
    const onChange = vi.fn();

    render(
      <ParticipantFields
        participants={[{ name: "メンバーA" }]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("メンバーA"), {
      target: { value: "メンバーC" },
    });

    expect(onChange).toHaveBeenCalledWith([{ name: "メンバーC" }]);
  });

  it("does not show delete button for existing participants with id", () => {
    render(
      <ParticipantFields
        participants={[
          { id: "550e8400-e29b-41d4-a716-446655440000", name: "メンバーA" },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("メンバーA")).toBeInTheDocument();
    expect(screen.queryByText("削除")).not.toBeInTheDocument();
  });

  it("shows delete button only for new participants", () => {
    render(
      <ParticipantFields
        participants={[
          { id: "550e8400-e29b-41d4-a716-446655440000", name: "メンバーA" },
          { name: "メンバーB" },
        ]}
        onChange={vi.fn()}
      />,
    );

    const deleteButtons = screen.getAllByText("削除");
    expect(deleteButtons).toHaveLength(1);
  });

  it("preserves id when updating existing participant name", () => {
    const onChange = vi.fn();
    const participantId = "550e8400-e29b-41d4-a716-446655440000";

    render(
      <ParticipantFields
        participants={[{ id: participantId, name: "メンバーA" }]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("メンバーA"), {
      target: { value: "メンバーC" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: participantId, name: "メンバーC" },
    ]);
  });
});
