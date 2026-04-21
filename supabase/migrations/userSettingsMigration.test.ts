import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260422000000_create_user_settings.sql";

describe("user_settings migration", () => {
  it("enforces display_name format in the database", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("constraint user_settings_display_name_format_check");
    expect(sql).toContain("display_name = btrim(display_name)");
    expect(sql).toContain("char_length(display_name) <= 50");
  });
});
