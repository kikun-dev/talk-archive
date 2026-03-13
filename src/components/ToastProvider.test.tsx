import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastProvider";

function TestConsumer() {
  const { addToast } = useToast();
  return (
    <div>
      <button onClick={() => addToast("成功しました", "success")}>
        success
      </button>
      <button onClick={() => addToast("失敗しました", "error")}>
        error
      </button>
    </div>
  );
}

describe("ToastProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children", () => {
    render(
      <ToastProvider>
        <p>child</p>
      </ToastProvider>,
    );
    expect(screen.getByText("child")).toBeDefined();
  });

  it("shows toast when addToast is called", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("success"));
    expect(screen.getByText("成功しました")).toBeDefined();
  });

  it("shows error toast", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("error"));
    expect(screen.getByText("失敗しました")).toBeDefined();
  });

  it("dismisses toast when close button clicked", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("success"));
    expect(screen.getByText("成功しました")).toBeDefined();

    const closeButton = screen.getByLabelText("閉じる");
    fireEvent.click(closeButton);
    expect(screen.queryByText("成功しました")).toBeNull();
  });

  it("auto-dismisses toast after timeout", () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("success"));
    expect(screen.getByText("成功しました")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("成功しました")).toBeNull();

    vi.useRealTimers();
  });

  it("clears pending timers on unmount", () => {
    vi.useFakeTimers();

    const { unmount } = render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("success"));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    vi.useRealTimers();
  });

  it("throws when useToast is used outside provider", () => {
    function Orphan() {
      useToast();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(
      "useToast must be used within a ToastProvider",
    );
  });
});
