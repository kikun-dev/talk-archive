import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewConversationForm } from "./NewConversationForm";
import type { Source } from "@/types/domain";

vi.mock("@/app/(app)/conversations/new/actions", () => ({
  createConversationAction: vi.fn(),
}));

const sources: Source[] = [
  {
    id: "src-1",
    userId: "user-1",
    name: "メッセージアプリ",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "src-2",
    userId: "user-1",
    name: "トークアプリ",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
];

describe("NewConversationForm", () => {
  it("renders all form fields", () => {
    render(<NewConversationForm sources={[]} />);

    expect(screen.getByLabelText("タイトル")).toBeInTheDocument();
    expect(screen.getByLabelText("グループ")).toBeInTheDocument();
    expect(screen.getByLabelText("トークの出所")).toBeInTheDocument();
    expect(screen.getByText("会話期間")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成" })).toBeInTheDocument();
  });

  it("renders idol group options", () => {
    render(<NewConversationForm sources={[]} />);

    const select = screen.getByLabelText("グループ");
    expect(select).toBeInTheDocument();

    expect(screen.getByText("乃木坂46")).toBeInTheDocument();
    expect(screen.getByText("櫻坂46")).toBeInTheDocument();
    expect(screen.getByText("日向坂46")).toBeInTheDocument();
  });

  it("renders source options", () => {
    render(<NewConversationForm sources={sources} />);

    expect(screen.getByText("メッセージアプリ")).toBeInTheDocument();
    expect(screen.getByText("トークアプリ")).toBeInTheDocument();
  });

  it("renders empty source option when no sources", () => {
    render(<NewConversationForm sources={[]} />);

    const sourceSelect = screen.getByLabelText("トークの出所");
    expect(sourceSelect).toBeInTheDocument();
    expect(screen.getByText("なし")).toBeInTheDocument();
  });

  it("renders initial active period fields", () => {
    render(<NewConversationForm sources={[]} />);

    const dateInputs = screen.getAllByDisplayValue("");
    // At least 2 date inputs (start + end) from the initial period
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("has title input as required", () => {
    render(<NewConversationForm sources={[]} />);

    const titleInput = screen.getByLabelText("タイトル");
    expect(titleInput).toBeRequired();
  });

  it("has idol group select as required", () => {
    render(<NewConversationForm sources={[]} />);

    const groupSelect = screen.getByLabelText("グループ");
    expect(groupSelect).toBeRequired();
  });
});
