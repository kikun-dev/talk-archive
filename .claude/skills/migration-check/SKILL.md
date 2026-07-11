---
name: migration-check
description: Supabase migration を含む PR やブランチ差分をローカルで検証する。migration の適用確認、SQL の安全性レビュー、Database 型と関連ドキュメントの同期確認に使う。DB migration 差分のレビュー時に必ず使う。
---

# Supabase migration 検証

migration 差分をレビューするための検証専用スキル。ファイルを変更せず、以下を順番どおり実行する。

## 安全規則

- remote / linked DB へは書き込まない。`supabase db push` は絶対に実行しない
- `db reset` / `migration list` / `gen types` は必ず `--local` を明示する
- `db reset --local` はローカル DB のデータを削除する。対象がローカルであることを確認してから実行する
- 型生成結果は一時ファイルへ出力し、作業ツリーを汚さない
- CLI 出力中の credential / secret（JWT secret、service-role key 等）を PR コメントや会話へ転載しない。結果は `成功 / 失敗 / 未確認` の要約だけを記録する

## 手順

### 1. 対象を特定する

PR では PR 番号を指定して実行する。`gh pr diff` はその PR の base / head 間を比較する。

```bash
pr_number="${PR_NUMBER:?PR_NUMBER is required}"
gh pr diff "$pr_number" --name-only | rg '^supabase/migrations/[0-9]{14}_.+\.sql$'
```

ローカルでは base を明示し、現在の `HEAD` と比較する。通常は `origin/main` を使う。

```bash
base_ref=origin/main
git rev-parse --verify "$base_ref"
git diff --name-only "$base_ref"...HEAD -- | rg '^supabase/migrations/[0-9]{14}_.+\.sql$'
```

`--name-only` で追加・変更・削除をすべて拾う。差分がなければ終了する。既存 migration の変更・削除は
migration の不変性を損なっていないか確認する。

### 2. ローカル環境を確認する

以下を順に実行する。

```bash
docker info
npx supabase --version
npx supabase status
```

`status` で停止を確認した場合だけ、次を実行してから再度 `status` を確認する。

```bash
npx supabase start
npx supabase status
```

`start` / `status` はローカル専用コマンドで `--local` オプションを持たない。Docker / CLI を利用できない場合は
検証を中止し、成功扱いにせず「未確認」として理由を記録する。

### 3. 初期状態から適用する

以下をそのまま実行する。

```bash
npx supabase db reset --local
npx supabase migration list --local
```

- reset で全 migration と seed がエラーなく適用されることを確認する
- migration list の Local 履歴に、手順 1 の各ファイル名の timestamp が存在することを確認する
- reset 失敗、または対象 timestamp の欠落は原則 P1 とする

### 4. SQL をレビューする

変更種別に応じて確認する。

- **RPC**: security mode が明示され、原則 `security invoker` である。固定 `search_path` があり、権限付与と既存 RLS が意図どおり機能する。`security definer` の場合は必要性、関数内の認可、実行権限も確認する
- **テーブル**: RLS が有効で、必要な操作の policy がある。本人データは `user_id` スコープを維持する
- **外部キー**: FK 列に index がある
- **constraint / index**: 制約と index が要件を満たし、重複や不足がない
- **破壊的変更**: データ損失と依存先への影響を確認し、実行可能な rollback 方針が PR にある

### 5. 型とドキュメントの同期を確認する

schema を変える差分では、生成型を一時ファイルへ出して比較する。

```bash
types_file="$(mktemp)"
trap 'rm -f "$types_file"' EXIT
npx supabase gen types typescript --local > "$types_file"
diff -u src/types/database.ts "$types_file"
```

型生成が失敗した場合は成功扱いにせず「未確認」とする。diff 全体の有無だけで同期漏れと断定せず、今回の
migration が変更した table / column / RPC / enum 等と関係する差分かを照合する。関係する差分だけを
`src/types/database.ts` の同期漏れとして指摘し、Issue #123 の nullable 補正など無関係な既知ドリフトは
「補足」に分離する。テーブル、record 属性、Storage などの設計変更では `docs/database.md` をはじめ、
関連する docs / ADR も同期されているか確認する。

## レビューへの記録

`pr-review` の「補足」に以下を `成功 / 失敗 / 未確認` のいずれかとともに必ず記載する。

- 対象 migration ファイル: 検出結果
- `db reset --local`: 適用結果
- `migration list --local`: 対象 timestamp の確認結果
- SQL チェックリスト: 変更種別ごとの確認結果
- 型 / docs 同期: 今回の DB オブジェクトに関係する差分と既知ドリフトを分けた確認結果

Docker / CLI などの環境要因で実行できない場合、その事実自体はコード指摘にせず「未確認」と理由を記載する。
