---
name: migration
description: Supabaseのmigrationファイルを追加する。「migration作って」「マイグレーション追加」「テーブル追加して」「RLS変更して」などのDB変更時に使う。命名→RLS/インデックス/RPCのチェックリスト適用→型再生成→関連ドキュメント更新まで一括で行う。
argument-hint: "<DB変更の内容>"
---

# Supabase migration 追加

`supabase/migrations/` に migration を追加する。Claude / Codex 共用スキル。

## 手順

### 1. 命名

- ファイル名: `YYYYMMDDHHMMSS_snake_case_summary.sql`（UTC タイムスタンプ。既存 migration の命名に合わせる）
  - `npx supabase migration new <summary>` で生成するか、現在時刻から手動で命名する
    （Supabase CLI は依存に含まれないため、既存スクリプトと同様に `npx` 経由で実行する — `scripts/generate-db-types.mjs` 参照）
  - 既存ファイルより新しいタイムスタンプになっていることを確認する
- データ投入は migration ではなく `supabase/seed.sql` に置く
- ファイル冒頭に目的をコメントで書く（既存 migration のスタイルに合わせる）

### 2. 内容チェックリスト（該当するものを必ず適用）

- **新規テーブル**:
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + 必要な操作分のポリシーを必ず付ける
  - ポリシーは既存パターンに合わせる（本アプリは単一ユーザー・本人データのみ:
    `user_id = (select auth.uid())` スコープ。初期スキーマ migration が見本）
  - `auth.*` 関数は `(select auth.uid())` 形式で書く（行ごとの再評価を避ける）
- **外部キー追加**: FK 列にインデックスを付ける
- **RPC 関数**: `set search_path = public` を固定値で必ず指定する（既存 atomic RPC 共通のパターン。
  search_path 未指定は不可 — `20260310073000_fix_security_advisor_warnings.sql` で後追い修正した経緯あり）。
  `public` 以外（`''` や `pg_catalog`）にする場合は、関数本体のテーブル・関数・型をすべて
  `public.*` 等でスキーマ修飾しないと適用時に解決エラーになる点に注意する
- **複数テーブル・複数行の一括更新**: アプリ側で逐次更新せず、atomic RPC にまとめる
  （`add_atomic_text_record_append` / `add_atomic_conversation_metadata_functions` のパターン）
- **Storage**: バケットポリシーには bucket_id + `{userId}/` プレフィックス制約を付ける
  （`20260311100000_create_media_storage_bucket.sql` のパターン。ファイル取得は signed URL 前提）
- **破壊的変更（DROP / 型変更）**: ロールバック方針を PR の DB / Migration セクションに書けるよう整理しておく

### 3. 適用と検証

- **ローカルで検証**: `npx supabase db reset` を実行し、新しい migration を含む
  全 migration + seed がエラーなく適用されることを確認する
  （ローカル Supabase が起動していなければ `npx supabase start`）
- スキーマを変えたら Database 型を再生成する: `pnpm db:gen-types`
  （`src/types/database.ts` が更新される）
- `pnpm typecheck && pnpm lint && pnpm test` と、関連画面の手動確認を行う
- **本番へ反映**: `npx supabase db push` は本番 DB への書き込みのため **ユーザーが実行する**

### 4. 関連ドキュメントの更新（該当する場合のみ）

- テーブル・record 属性・ストレージ設計の変更 → `docs/database.md` を更新
- PR には `.github/PULL_REQUEST_TEMPLATE.MD` の「DB / Migration」セクションを必ず記載
  （ファイル名・変更点・RLS/Policy 変更・Rollback 方針）

## 完了条件

- migration が正しい命名で作成され、チェックリストの該当項目が適用されている
- ローカルで適用・動作確認済み（未適用ならその旨を明示）
- Database 型が再生成され、typecheck が通っている
- 関連ドキュメントが更新されている（該当する場合）
