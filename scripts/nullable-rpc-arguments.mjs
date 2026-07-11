/**
 * Issue #123 で確認した既知のリグレッション:
 * このプロジェクトのローカル Postgres で実行できるすべての Supabase CLI
 * （2.40.0 から devDependency の固定バージョンまで。これより古いバージョンは
 * Postgres 17 に接続できない）では、対象カラムの nullable 制約にかかわらず、
 * 通常の RPC 引数がすべて non-nullable として生成される。
 * Postgres の通常の関数 IN 引数には NOT NULL という概念がないため、`gen types` は
 * nullable かどうかを推測するしかなく、現行の生成処理は常に non-null と判定する。
 *
 * 以下のマップは、アプリが実際に `null` を渡す引数へ `| null` を復元する
 * （根拠は各呼び出し元と対応するスキーマを参照）。
 * `supabase/migrations/` の RPC シグネチャと同期して管理すること。
 * 対象引数が消失または形式変更された場合、後処理は明示的なエラーで停止する。
 * CLI 側で既に nullable として生成される引数には何もしないため、将来この
 * リグレッションが修正されても二重に `null` を追加しない。
 */
export const NULLABLE_RPC_ARGUMENTS = {
  // records.title には NOT NULL 制約がなく、各 Repository は RPC 呼び出し時に
  // `params.title ?? null` または `params.title: string | null` を渡す。
  // records.content にも NOT NULL 制約はないが、`records_text_content_check` により
  // record_type = 'text' の場合は non-null が必須となる。
  // append_text_record は常に 'text' を挿入するため、同関数の p_content は
  // non-nullable が正しく、意図的に以下のマップへ含めていない。
  append_media_record: ["p_title", "p_content"],
  append_text_record: ["p_title"],
  // conversations.source_id と conversations.cover_image_path は nullable
  // （任意の外部キー / カバー画像）であり、Repository はそれぞれ
  // `params.sourceId ?? null` / `params.coverImagePath ?? null` を渡す。
  create_conversation_with_metadata: ["p_source_id", "p_cover_image_path"],
  // update_conversation_with_metadata は差分更新 RPC であり、各 p_has_* が
  // 対応する値を更新するかどうかを示す。フィールドを変更しない場合、Repository は
  // 値本体へ `?? null` を適用して渡す
  // （supabase/migrations/20260311083000_add_conversation_participants.sql 参照）。
  update_conversation_with_metadata: [
    "p_title",
    "p_idol_group",
    "p_source_id",
    "p_cover_image_path",
  ],
};

/**
 * 単一 RPC 関数の `Args: { ... }` ブロック内で、`argName: SomeType` を
 * `argName: SomeType | null` に書き換える。他の関数にある同名引数は変更しない
 * （例: `p_title` は `create_conversation_with_metadata` では non-nullable、
 * `append_text_record` では nullable）。
 * 関数または引数が見つからない場合は例外を投げ、マップを無効にするスキーマ変更を
 * 即座に検知する。誤った生成型を黙ってコミットすることを防ぐための fail-fast である。
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
      // CLI 側の修正などですでに nullable の場合は変更しない。
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
