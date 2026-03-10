import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewConversationForm } from "./NewConversationForm";

vi.mock("@/app/(app)/conversations/new/actions", () => ({
  createConversationAction: vi.fn(),
}));

describe("NewConversationForm", () => {
  it("renders all form fields", () => {
    render(<NewConversationForm />);

    expect(screen.getByLabelText("タイトル")).toBeInTheDocument();
    expect(screen.getByLabelText("グループ")).toBeInTheDocument();
    expect(screen.getByText("会話期間")).toBeInTheDocument();
    expect(screen.getByText("参加者")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成" })).toBeInTheDocument();
  });

  it("renders idol group options", () => {
    render(<NewConversationForm />);

    const select = screen.getByLabelText("グループ");
    expect(select).toBeInTheDocument();

    expect(screen.getByText("乃木坂46")).toBeInTheDocument();
    expect(screen.getByText("櫻坂46")).toBeInTheDocument();
    expect(screen.getByText("日向坂46")).toBeInTheDocument();
  });

  it("renders initial active period fields", () => {
    render(<NewConversationForm />);

    const dateInputs = screen.getAllByDisplayValue("");
    // At least 2 date inputs (start + end) from the initial period
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders initial participant fields", () => {
    render(<NewConversationForm />);

    expect(screen.getByPlaceholderText("参加者名")).toBeInTheDocument();
  });

  it("has title input as required", () => {
    render(<NewConversationForm />);

    const titleInput = screen.getByLabelText("タイトル");
    expect(titleInput).toBeRequired();
  });

  it("has idol group select as required", () => {
    render(<NewConversationForm />);

    const groupSelect = screen.getByLabelText("グループ");
    expect(groupSelect).toBeRequired();
  });
});
