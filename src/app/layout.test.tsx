import { describe, expect, it, vi } from "vitest";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-sans" }),
  Geist_Mono: () => ({ variable: "font-mono" }),
}));

describe("root metadata", () => {
  it("uses the official brand and favicon", async () => {
    const { metadata } = await import("./layout");

    expect(metadata.title).toEqual({
      default: APP_NAME,
      template: `%s | ${APP_NAME}`,
    });
    expect(metadata.description).toBe(APP_DESCRIPTION);
    expect(metadata.applicationName).toBe(APP_NAME);
    expect(metadata.icons).toEqual({
      icon: [
        {
          url: "/favicon.png",
          type: "image/png",
          sizes: "1254x1254",
        },
      ],
    });
  });
});
