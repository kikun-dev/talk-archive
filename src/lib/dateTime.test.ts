import { describe, expect, it } from "vitest";
import {
  formatDateHeaderJst,
  formatDateJst,
  formatDateTimeJst,
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

  it("formats date header in JST", () => {
    expect(formatDateHeaderJst("2026-01-15T10:30:00Z")).toContain("2026年");
  });

  it("builds date keys in JST", () => {
    expect(getDateKeyJst("2026-01-15T15:30:00Z")).toBe("2026-01-16");
  });
});
