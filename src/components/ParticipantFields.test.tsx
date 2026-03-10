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

  it("removes a participant", () => {
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
});
