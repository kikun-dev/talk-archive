import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("globals.css", () => {
  it("keeps the app in light mode regardless of OS color scheme", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toContain("--background: #ffffff");
    expect(css).toContain("--foreground: #171717");
    expect(css).not.toContain("prefers-color-scheme: dark");
  });
});
