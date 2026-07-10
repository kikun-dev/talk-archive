---
name: pr
description: プロジェクトのPRテンプレートに沿ってPull Requestを作成する。「PR作って」「PRにして」「プルリク作成」などで使う。ブランチ確認→typecheck/lint/test→日本語本文（Closes #N）→gh pr createまで一括で行う。
argument-hint: "[関連Issue番号] [--draft]"
---

# PR 作成

`.github/PULL_REQUEST_TEMPLATE.MD` に沿って PR を作成する。Claude / Codex 共用スキル。
`docs/ai/ai-collaboration.md` のワークフロー手順3の実行版。

## 引数

- `関連Issue番号`（省略可）: 省略時はブランチ名（例: `feature/120-...`）や会話の文脈から特定する。特定できなければユーザーに確認する
- `--draft`（省略可）: `gh pr create --draft` でドラフト PR として作成する

## 手順

### 1. 事前チェック

- カレントブランチが `main` でないことを確認する。`main` にいる場合は作業ブランチを切ってから進める
- 未コミットの変更がないか `git status` で確認する。あればユーザーに確認してからコミットする
- ベースブランチ（`main`）との差分（`git log main..HEAD --oneline` と `git diff main --stat`）で PR に載る内容を把握する

### 2. 検証

- `pnpm typecheck && pnpm lint && pnpm test` を実行する（`docs/development.md` の必須チェック。build は CI で確認）
- 失敗したまま PR を作らない

### 3. 本文の組み立て

`.github/PULL_REQUEST_TEMPLATE.MD` の全セクションを日本語で埋める:

- **Why / Background**: 関連 Issue の背景を要約
- **What / Summary**: ユーザー視点の箇条書き
- **Scope / Impact**: 影響する画面・API・データ / 影響しないもの / 破壊的変更の有無
- **Related Issues**: `Closes #N`（原則必須。1 Issue = 1 PR — `docs/development.md`。
  例外は設計判断を含まない定期メンテナンス PR のみ。該当する場合はその旨を本文に書く）
- **DB / Migration**: DB 変更があるときだけ記載。無ければセクションごと「変更なし」と明記
- **Test Plan**: 実施した検証を正直に書く。未実施項目は理由付きで「未実施」とする
  （実行していないテストを「通った」と書かない — `CLAUDE.md`）。
  新規実装は TDD 前提（`docs/development.md`）のため、追加・更新したテストを必ず記載する。
  テストを追加していない場合はその理由を書く
- **Screenshots**: UI 変更時のみ
- **Review Notes**: 見てほしい点を優先順に
- **Checklist**: 各項目を実際に確認してからチェックする
- テンプレート末尾のフッター行（🤖 Generated with Claude Code / ✅ Human-checked）は残す

### 4. PR 作成

- push 済みでなければ `git push -u origin <ブランチ名>`（force push はしない）
- 本文は scratchpad に書き出し、`gh pr create --title "<タイトル>" --body-file <ファイル>` で作成する
- タイトルはコミット規約に合わせた日本語（例: `feat: レコードにメディアを後から添付できるようにする`）
- 作成後は PR URL を提示する（レビューは Codex が担当 — `docs/ai/ai-collaboration.md`）

## 完了条件

- typecheck / lint / test が通った状態で PR が作成されている
- 本文がテンプレート準拠で、`Closes #N` を含む（例外時は理由を明記）
