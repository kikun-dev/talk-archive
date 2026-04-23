import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import ConversationLoading from "./loading";

describe("ConversationLoading", () => {
  it("uses the fixed-height chat layout", () => {
    const { container } = render(<ConversationLoading />);
    const loadingShell = container.firstElementChild;

    expect(loadingShell).toHaveClass("h-full");
    expect(loadingShell).not.toHaveClass("min-h-[calc(100dvh-4rem)]");
  });
});
