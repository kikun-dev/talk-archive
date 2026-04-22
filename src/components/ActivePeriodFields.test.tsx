import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivePeriodFields } from "./ActivePeriodFields";
import type { ConversationActivePeriodInput } from "@/usecases/conversationUseCases";

describe("ActivePeriodFields", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders empty state when no periods", () => {
    render(<ActivePeriodFields periods={[]} onChange={vi.fn()} />);

    expect(screen.getByText("期間を追加してください")).toBeInTheDocument();
  });

  it("renders period inputs", () => {
    const periods: ConversationActivePeriodInput[] = [
      { startDate: "2026-01-01", endDate: "2026-06-30" },
    ];
    render(<ActivePeriodFields periods={periods} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("2026-01-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-06-30")).toBeInTheDocument();
  });

  it("calls onChange with new period initialized to current JST date when add button is clicked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T15:30:45Z"));

    const onChange = vi.fn();
    const periods: ConversationActivePeriodInput[] = [
      { startDate: "2026-01-01", endDate: null },
    ];
    render(<ActivePeriodFields periods={periods} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ 期間を追加"));

    expect(onChange).toHaveBeenCalledWith([
      { startDate: "2026-01-01", endDate: null },
      { startDate: "2026-04-23", endDate: null },
    ]);
  });

  it("calls onChange without the removed period when delete is clicked", () => {
    const onChange = vi.fn();
    const periods: ConversationActivePeriodInput[] = [
      { startDate: "2026-01-01", endDate: null },
      { startDate: "2026-07-01", endDate: null },
    ];
    render(<ActivePeriodFields periods={periods} onChange={onChange} />);

    const deleteButtons = screen.getAllByText("削除");
    fireEvent.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledWith([
      { startDate: "2026-07-01", endDate: null },
    ]);
  });

  it("calls onChange with updated startDate when changed", () => {
    const onChange = vi.fn();
    const periods: ConversationActivePeriodInput[] = [
      { startDate: "2026-01-01", endDate: null },
    ];
    render(<ActivePeriodFields periods={periods} onChange={onChange} />);

    const startInput = screen.getByDisplayValue("2026-01-01");
    fireEvent.change(startInput, { target: { value: "2026-02-01" } });

    expect(onChange).toHaveBeenCalledWith([
      { startDate: "2026-02-01", endDate: null },
    ]);
  });

  it("calls onChange with null endDate when endDate is cleared", () => {
    const onChange = vi.fn();
    const periods: ConversationActivePeriodInput[] = [
      { startDate: "2026-01-01", endDate: "2026-06-30" },
    ];
    render(<ActivePeriodFields periods={periods} onChange={onChange} />);

    const endInput = screen.getByDisplayValue("2026-06-30");
    fireEvent.change(endInput, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith([
      { startDate: "2026-01-01", endDate: null },
    ]);
  });

  it("renders label and add button", () => {
    render(<ActivePeriodFields periods={[]} onChange={vi.fn()} />);

    expect(screen.getByText("会話期間")).toBeInTheDocument();
    expect(screen.getByText("+ 期間を追加")).toBeInTheDocument();
  });
});
