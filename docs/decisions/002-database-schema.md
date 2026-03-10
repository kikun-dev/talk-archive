# ADR-002: データベーススキーマ設計

## Status

Accepted

## Context

トークアーカイブアプリの初期 DB スキーマを設計する必要がある。
docs/database.md で定義された5テーブル（users, sources, conversations, records, attachments）を具体化する。

主な検討事項:
- users テーブルを自前で作るか、Supabase Auth の `auth.users` を利用するか
- 日本語全文検索の方式
- RLS（Row Level Security）の設計

## Options

### users テーブル
- **A: 自前の users テーブルを作成** — プロフィール情報などを拡張しやすい
- **B: auth.users を直接参照** — テーブルを減らせるが拡張性が下がる

### 日本語検索
- **A: pg_trgm + GIN インデックス** — Supabase Cloud で利用可能、部分一致検索に対応
- **B: pgroonga** — 日本語形態素解析に対応、Supabase Cloud では利用不可

## Evaluation

| 評価軸 | users 自前 | auth.users 直接 |
|--------|-----------|----------------|
| 実装コスト | △ マイグレーション追加 | ◎ 不要 |
| 拡張性 | ◎ | △ |
| 現時点の必要性 | △ 単一ユーザー | ◎ 十分 |

| 評価軸 | pg_trgm | pgroonga |
|--------|---------|---------|
| Supabase Cloud 互換 | ◎ | ✗ 非対応 |
| 日本語精度 | ○ 部分一致 | ◎ 形態素解析 |
| 実装コスト | ◎ | △ |

## Decision

- **users テーブルは作成しない。** `auth.users` を直接参照する。単一ユーザーアプリのため、プロフィール拡張の必要性が低い。将来必要になれば `profiles` テーブルを追加する。
- **pg_trgm + GIN インデックス** を採用。Supabase Cloud で利用可能で、日本語の部分一致検索に十分対応できる。
- **RLS** を全テーブルに設定し、`auth.uid()` でユーザーを制限する。records と attachments は親テーブル経由で所有者を判定する。
- **updated_at** の自動更新トリガーを設定する。

## Consequences

- users テーブルが無いため、ユーザープロフィール情報の保存には別途テーブル追加が必要
- pg_trgm は形態素解析ではないため、日本語の検索精度に限界がある（データ量増加時に外部検索サービスを検討）
- records/attachments の RLS は EXISTS サブクエリを使うため、大量データ時にパフォーマンスへの影響を確認する必要がある
