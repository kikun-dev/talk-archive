import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders message with error styling", () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        id="t1"
        message="エラーが発生しました"
        type="error"
        onDismiss={onDismiss}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("エラーが発生しました");
    expect(alert.className).toContain("border-red-200");
  });

  it("renders message with success styling", () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        id="t2"
        message="保存しました"
        type="success"
        onDismiss={onDismiss}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("border-green-200");
  });

  it("renders message with warning styling", () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        id="t4"
        message="一部の処理に失敗しました"
        type="warning"
        onDismiss={onDismiss}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("一部の処理に失敗しました");
    expect(alert.className).toContain("border-amber-200");
  });

  it("calls onDismiss when close button is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        id="t3"
        message="テスト"
        type="success"
        onDismiss={onDismiss}
      />,
    );
    const closeButton = screen.getByLabelText("閉じる");
    fireEvent.click(closeButton);
    expect(onDismiss).toHaveBeenCalledWith("t3");
  });
});
