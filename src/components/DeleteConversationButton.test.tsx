import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeleteConversationButton } from "./DeleteConversationButton";
import { ToastProvider } from "./ToastProvider";

vi.mock("@/app/(app)/conversations/[id]/actions", () => ({
  deleteConversationAction: vi.fn(),
}));

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import { deleteConversationAction } from "@/app/(app)/conversations/[id]/actions";

describe("DeleteConversationButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows an error toast and does not navigate when deletion fails", async () => {
    vi.mocked(deleteConversationAction).mockResolvedValue({
      error: "会話の削除に失敗しました。時間をおいて再度お試しください。",
    });

    render(
      <ToastProvider>
        <DeleteConversationButton conversationId="conv-1" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("会話を削除"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "会話の削除に失敗しました。時間をおいて再度お試しください。",
        ),
      ).toBeInTheDocument();
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("shows a warning toast and navigates home when storage cleanup fails", async () => {
    vi.mocked(deleteConversationAction).mockResolvedValue({
      warning:
        "トークは削除しましたが、メディアファイルの削除に失敗しました。",
    });

    render(
      <ToastProvider>
        <DeleteConversationButton conversationId="conv-1" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("会話を削除"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "トークは削除しましたが、メディアファイルの削除に失敗しました。",
        ),
      ).toBeInTheDocument();
    });
    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("does nothing when the user cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <ToastProvider>
        <DeleteConversationButton conversationId="conv-1" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("会話を削除"));

    expect(deleteConversationAction).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
