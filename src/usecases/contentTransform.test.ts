import { describe, it, expect } from "vitest";
import { replaceMyNamePlaceholder } from "./contentTransform";

describe("replaceMyNamePlaceholder", () => {
  it("replaces {{MY_NAME}} with display name", () => {
    expect(
      replaceMyNamePlaceholder("こんにちは{{MY_NAME}}さん", "太郎"),
    ).toBe("こんにちは太郎さん");
  });

  it("replaces multiple occurrences", () => {
    expect(
      replaceMyNamePlaceholder(
        "{{MY_NAME}}さん、{{MY_NAME}}さん！",
        "太郎",
      ),
    ).toBe("太郎さん、太郎さん！");
  });

  it("returns text unchanged when displayName is empty", () => {
    expect(
      replaceMyNamePlaceholder("こんにちは{{MY_NAME}}さん", ""),
    ).toBe("こんにちは{{MY_NAME}}さん");
  });

  it("returns text unchanged when no placeholder exists", () => {
    expect(
      replaceMyNamePlaceholder("こんにちは", "太郎"),
    ).toBe("こんにちは");
  });

  it("handles displayName with special characters", () => {
    expect(
      replaceMyNamePlaceholder("{{MY_NAME}}です", "太郎$1"),
    ).toBe("太郎$1です");
  });

  it("handles empty text", () => {
    expect(replaceMyNamePlaceholder("", "太郎")).toBe("");
  });

  it("handles placeholder only", () => {
    expect(replaceMyNamePlaceholder("{{MY_NAME}}", "太郎")).toBe("太郎");
  });
});
