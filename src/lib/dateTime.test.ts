import { describe, expect, it } from "vitest";
import {
  formatDateHeaderJst,
  formatDateJst,
  formatDateTimeJst,
  formatMessageDateTimeJst,
  formatTimeJst,
  getDateKeyJst,
} from "./dateTime";

describe("dateTime", () => {
  it("formats time in JST", () => {
    expect(formatTimeJst("2026-01-15T10:30:00Z")).toBe("19:30");
  });

  it("formats date in JST", () => {
    expect(formatDateJst("2026-01-15T15:30:00Z")).toBe("2026/01/16");
  });

  it("formats date time in JST", () => {
    expect(formatDateTimeJst("2026-01-15T10:30:00Z")).toBe(
      "2026/01/15 19:30",
    );
  });

  it("formats current-year message date time without year in JST", () => {
    expect(
      formatMessageDateTimeJst(
        "2026-04-22T05:30:00Z",
        new Date("2026-01-01T00:00:00Z"),
      ),
    ).toBe("04/22(水) 14:30");
  });

  it("formats non-current-year message date time with year in JST", () => {
    expect(
      formatMessageDateTimeJst(
        "2025-04-22T05:30:00Z",
        new Date("2026-01-01T00:00:00Z"),
      ),
    ).toBe("2025/04/22(火) 14:30");
  });

  it("compares current year in JST", () => {
    expect(
      formatMessageDateTimeJst(
        "2026-01-01T00:30:00+09:00",
        new Date("2025-12-31T15:30:00Z"),
      ),
    ).toBe("01/01(木) 00:30");
  });

  it("formats date header in JST", () => {
    expect(formatDateHeaderJst("2026-01-15T10:30:00Z")).toContain("2026年");
  });

  it("builds date keys in JST", () => {
    expect(getDateKeyJst("2026-01-15T15:30:00Z")).toBe("2026-01-16");
  });
});
