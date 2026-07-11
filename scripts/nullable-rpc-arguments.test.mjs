import { describe, expect, it } from "vitest";
import { markArgumentsNullable } from "./nullable-rpc-arguments.mjs";

// generate-db-types.mjs が supabase CLI から受け取る実際の出力に近いフィクスチャ。
// append_media_record と append_text_record が同名引数 `p_title` を持つ点が
// 「関数スコープでしか置換されないこと」を検証する肝になる。
function createFixtureSource() {
  return [
    "export type Database = {",
    "  public: {",
    "    Functions: {",
    "      append_media_record: {",
    "        Args: {",
    "          p_content: string",
    "          p_conversation_id: string",
    "          p_title: string",
    "        }",
    "        Returns: Json",
    "      }",
    "      append_text_record: {",
    "        Args: {",
    "          p_content: string",
    "          p_conversation_id: string",
    "          p_title: string | null",
    "        }",
    "        Returns: Json",
    "      }",
    "    }",
    "  }",
    "}",
    "",
  ].join("\n");
}

describe("markArgumentsNullable", () => {
  it("rewrites only the targeted argument on the targeted function", () => {
    const source = createFixtureSource();

    const result = markArgumentsNullable(source, "append_media_record", [
      "p_title",
    ]);

    // append_media_record.p_title は書き換えられる。
    expect(result).toContain(
      [
        "      append_media_record: {",
        "        Args: {",
        "          p_content: string",
        "          p_conversation_id: string",
        "          p_title: string | null",
        "        }",
      ].join("\n"),
    );

    // append_text_record 側の p_content / p_title（同名引数）は不変。
    expect(result).toContain(
      [
        "      append_text_record: {",
        "        Args: {",
        "          p_content: string",
        "          p_conversation_id: string",
        "          p_title: string | null",
        "        }",
      ].join("\n"),
    );

    // append_media_record.p_content（対象外の引数）は不変。
    expect(result).toContain("          p_content: string\n");
  });

  it("is a no-op when the argument is already nullable", () => {
    const source = createFixtureSource();

    const result = markArgumentsNullable(source, "append_text_record", [
      "p_title",
    ]);

    expect(result).toBe(source);
  });

  it("throws when the target function cannot be found", () => {
    const source = createFixtureSource();

    expect(() =>
      markArgumentsNullable(source, "does_not_exist_rpc", ["p_title"]),
    ).toThrow(/does_not_exist_rpc/);
  });

  it("throws when the target argument cannot be found on the function", () => {
    const source = createFixtureSource();

    expect(() =>
      markArgumentsNullable(source, "append_media_record", [
        "p_does_not_exist",
      ]),
    ).toThrow(/p_does_not_exist/);
  });
});
