# 開発フロー

## AI駆動開発

実装担当: Claude Code  
レビュー: Codex

---

## 基本ルール

1 Issue = 1 PR

PRは小さくする。

---

## 開発手順

1 Issue作成  
2 Claude Codeで実装  
3 PR作成  
4 CIチェック  
5 Codexレビュー  
6 マージ  
7 `main` 更新により自動デプロイ  

---

## 必須チェック

すべてのPRで以下を通す

- lint
- typecheck
- test
- build

補足:

- GitHub Actions は CI を担当する
- デプロイは `main` マージ後にプラットフォーム連携で自動実行される

---

## テスト方針

- 原則 TDD（テストファースト）で実装する
  - 先に失敗するテストを書く → 実装で通す → リファクタ（Red → Green → Refactor）
- Unit test
- Component test

Vitest + Testing Library

---

## DB型生成（`src/types/database.ts`）

`pnpm db:gen-types`（`scripts/generate-db-types.mjs`）でローカル Supabase のスキーマから
`src/types/database.ts` を再生成する。マイグレーションを追加・変更したら必ず実行する
（`.claude/skills/migration/SKILL.md` 参照）。

### Supabase CLI はバージョン固定（devDependency）

`supabase` を `package.json` の devDependencies にキャレットなしで固定しており、
`npx supabase ...` は常にこの固定版を解決する（`npx supabase --version` で確認できる）。
バージョンを上げる際は `pnpm add -D -E supabase@<version>` で明示的に固定し直す。

### RPC引数のnullable後処理（既知のCLIリグレッション対応）

Issue #123 で確認した通り、現行の `supabase gen types typescript` は Postgres 側で NOT NULL
制約を持たない RPC 引数（そもそも Postgres の関数引数に NOT NULL という概念はない）を
一律で non-nullable（`string`）として生成する。これは 2026-07 時点で入手できたどのバージョン
（PostgreSQL 17 ローカルスタックと互換性のある範囲）でも再現し、CLI バージョン固定だけでは
解決できなかった。

そのため `scripts/generate-db-types.mjs` は生成直後の出力に対して、決定的な後処理
（関数名・引数名を明示したマップ `NULLABLE_RPC_ARGUMENTS`）を適用し、実際に `null` を渡している
呼び出し元（`src/repositories/*.ts`）や対象カラムのnullable制約に合わせて `| null` を復元する。
マップにはそれぞれの根拠をコメントで記載している。対象の関数・引数がスキーマ変更で見つからなく
なった場合はスクリプトがエラーで停止するため、マイグレーションでRPCの引数を変更したときは
このマップも合わせて更新すること。

`pnpm db:gen-types` を2回連続で実行しても差分が出ないこと（冪等であること）を、
このスクリプトを変更した際は必ず確認する。
