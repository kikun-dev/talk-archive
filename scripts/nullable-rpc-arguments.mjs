/**
 * Known regression (see Issue #123): every "supabase" CLI release we could
 * install and run against this project's local Postgres (2.40.0 through the
 * pinned devDependency version; anything older refuses to talk to Postgres
 * 17 at all) generates every plain RPC argument as non-nullable, regardless
 * of the target column's actual nullability. Postgres itself has no NOT
 * NULL concept for a plain function IN parameter, so `gen types` can only
 * infer nullability heuristically — and the current generator's heuristic
 * always says "non-null".
 *
 * The entries below restore `| null` for arguments that this app actually
 * calls with `null` (see the call sites and the schema each maps to). Keep
 * this map in sync with the RPC signatures in `supabase/migrations/`; the
 * post-processing step below fails loudly if a mapped argument disappears
 * or changes shape, and it is a no-op for any argument the CLI already
 * generates as nullable (e.g. once this upstream regression is fixed).
 */
export const NULLABLE_RPC_ARGUMENTS = {
  // records.title has no NOT NULL constraint, and both repositories call
  // these RPCs with `params.title ?? null` / `params.title: string | null`.
  // records.content has no NOT NULL constraint either, but
  // `records_text_content_check` requires it to be non-null whenever
  // record_type = 'text' — append_text_record always inserts 'text', so
  // p_content there is correctly non-nullable and is intentionally not
  // listed below.
  append_media_record: ["p_title", "p_content"],
  append_text_record: ["p_title"],
  // conversations.source_id and conversations.cover_image_path are
  // nullable columns (optional FK / optional cover image); both repository
  // call sites pass `params.sourceId ?? null` / `params.coverImagePath ?? null`.
  create_conversation_with_metadata: ["p_source_id", "p_cover_image_path"],
  // update_conversation_with_metadata is a "diff update" RPC: each p_has_*
  // flag says whether the corresponding value should be applied at all, so
  // the value itself is passed as `?? null` from the repository whenever
  // the field is not being changed (see
  // supabase/migrations/20260311083000_add_conversation_participants.sql).
  update_conversation_with_metadata: [
    "p_title",
    "p_idol_group",
    "p_source_id",
    "p_cover_image_path",
  ],
};

/**
 * Rewrites `argName: SomeType` to `argName: SomeType | null` inside a single
 * RPC function's `Args: { ... }` block, without touching same-named
 * arguments in other functions (e.g. `p_title` is non-nullable in
 * `create_conversation_with_metadata` but nullable in `append_text_record`).
 * Throws if the function or the argument can't be found, so schema drift
 * that invalidates this map is caught immediately instead of silently
 * producing an incorrect committed type.
 */
export function markArgumentsNullable(source, functionName, argumentNames) {
  const blockPattern = new RegExp(
    `(      ${functionName}: \\{\\n        Args: \\{\\n)([\\s\\S]*?)(\\n        \\}\\n)`,
  );
  const blockMatch = source.match(blockPattern);
  if (!blockMatch) {
    throw new Error(
      `db:gen-types: could not find an "Args: { ... }" block for RPC function "${functionName}". ` +
        "It may have been renamed or removed — update NULLABLE_RPC_ARGUMENTS in scripts/nullable-rpc-arguments.mjs.",
    );
  }

  let argsBody = blockMatch[2];
  for (const argumentName of argumentNames) {
    const argumentPattern = new RegExp(
      `(          ${argumentName}: )([^\\n]+)`,
    );
    const argumentMatch = argsBody.match(argumentPattern);
    if (!argumentMatch) {
      throw new Error(
        `db:gen-types: could not find argument "${argumentName}" on RPC function "${functionName}". ` +
          "It may have been renamed or removed — update NULLABLE_RPC_ARGUMENTS in scripts/nullable-rpc-arguments.mjs.",
      );
    }

    const currentType = argumentMatch[2];
    if (currentType.includes("| null")) {
      // Already nullable (e.g. the upstream CLI regression has been fixed
      // for this argument) — nothing to patch.
      continue;
    }

    argsBody = argsBody.replace(
      argumentPattern,
      `$1${currentType} | null`,
    );
  }

  return (
    source.slice(0, blockMatch.index) +
    blockMatch[1] +
    argsBody +
    blockMatch[3] +
    source.slice(blockMatch.index + blockMatch[0].length)
  );
}
