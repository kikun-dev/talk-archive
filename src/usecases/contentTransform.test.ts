import { describe, it, expect } from "vitest";
import { replaceMyNamePlaceholder, splitTextByUrls } from "./contentTransform";

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

describe("splitTextByUrls", () => {
  it("returns a single text segment when there is no URL", () => {
    expect(splitTextByUrls("こんにちは")).toEqual([
      { type: "text", value: "こんにちは" },
    ]);
  });

  it("returns a single url segment when the text is only a URL", () => {
    expect(splitTextByUrls("https://example.com")).toEqual([
      { type: "url", value: "https://example.com" },
    ]);
  });

  it("splits text surrounding a URL", () => {
    expect(splitTextByUrls("見て https://example.com すごい")).toEqual([
      { type: "text", value: "見て " },
      { type: "url", value: "https://example.com" },
      { type: "text", value: " すごい" },
    ]);
  });

  it("splits multiple URLs", () => {
    expect(
      splitTextByUrls(
        "https://example.com と https://example.org を見て",
      ),
    ).toEqual([
      { type: "url", value: "https://example.com" },
      { type: "text", value: " と " },
      { type: "url", value: "https://example.org" },
      { type: "text", value: " を見て" },
    ]);
  });

  it("terminates a URL at a line break", () => {
    expect(splitTextByUrls("見て\nhttps://example.com\n見た？")).toEqual([
      { type: "text", value: "見て\n" },
      { type: "url", value: "https://example.com" },
      { type: "text", value: "\n見た？" },
    ]);
  });

  it("moves trailing Japanese punctuation back to the text segment", () => {
    expect(splitTextByUrls("見て。https://example.com。")).toEqual([
      { type: "text", value: "見て。" },
      { type: "url", value: "https://example.com" },
      { type: "text", value: "。" },
    ]);
  });

  it("moves a trailing closing bracket back to the text segment", () => {
    expect(splitTextByUrls("（詳細はhttps://example.com）")).toEqual([
      { type: "text", value: "（詳細は" },
      { type: "url", value: "https://example.com" },
      { type: "text", value: "）" },
    ]);
  });

  it("moves other trailing punctuation marks back to the text segment", () => {
    const cases: Array<[string, string]> = [
      ["https://example.com、", "、"],
      ["https://example.com」", "」"],
      ["https://example.com！", "！"],
      ["https://example.com？", "？"],
      ["https://example.com!", "!"],
      ["https://example.com?", "?"],
      ["https://example.com,", ","],
      ["https://example.com.", "."],
      ["https://example.com;", ";"],
      ["https://example.com:", ":"],
      ["https://example.com)", ")"],
    ];

    for (const [input, trailing] of cases) {
      expect(splitTextByUrls(input)).toEqual([
        { type: "url", value: "https://example.com" },
        { type: "text", value: trailing },
      ]);
    }
  });

  it("supports http as well as https", () => {
    expect(splitTextByUrls("http://example.com")).toEqual([
      { type: "url", value: "http://example.com" },
    ]);
  });

  it("returns an empty array for empty text", () => {
    expect(splitTextByUrls("")).toEqual([]);
  });

  it("linkifies an uppercase scheme while preserving the original casing", () => {
    expect(splitTextByUrls("HTTPS://example.com/x")).toEqual([
      { type: "url", value: "HTTPS://example.com/x" },
    ]);
  });

  it("linkifies a mixed-case scheme", () => {
    expect(splitTextByUrls("Http://example.com")).toEqual([
      { type: "url", value: "Http://example.com" },
    ]);
  });
});
