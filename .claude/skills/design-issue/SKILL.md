---
name: design-issue
description: プロジェクトのIssueテンプレートと設計提案フォーマットに沿ってGitHub Issueを起票する。「Issue化して」「Issueを作って」「設計Issueを起票」などで使う。feature/refactor/decision/bugの種別判定、ラベル付与、関連ドキュメント参照まで一括で行う。
argument-hint: "<Issueにしたい内容> [--draft]"
---

# 設計 Issue 起票

`.github/ISSUE_TEMPLATE/` のテンプレートと
`CLAUDE.md` の設計提案フォーマットに沿って GitHub Issue を作成する。

## 引数

- `内容`: Issue にしたい内容（会話の文脈から拾える場合は省略可）
- `--draft`（省略可）: Issue を作成せず、本文案の提示までで止める

## 手順

### 1. 種別の判定

内容から種別を判定し、テンプレート・ラベル・タイトル接頭辞を決める:

| 種別 | 判定基準 | テンプレート | ラベル | タイトル |
|------|----------|--------------|--------|----------|
| Feature | 振る舞いが変わる・機能が増える | `feature.yml` | `type:feature` | `[Feature] ` |
| Refactor | 振る舞い不変の構造改善 | `refactor.yml` | `type:refactor` | `[Refactor] ` |
| Decision | 実装前に設計判断だけ必要 | `decision.yml` | `type:decision` | `[Decision] ` |
| Bug | 不具合修正 | `bug.yml` | `type:bug` | `[Bug] ` |
| Chore | 開発環境・設定・ドキュメント | （テンプレートなし・自由記述） | `type:chore` | `[Chore] ` |

判定に迷う場合（例: セキュリティ強化は振る舞いが変わるので Feature）はユーザーに確認する。

### 2. 本文の組み立て

対象テンプレートの yml を読み、セクション構成（見出し・順序）を厳密に再現する。

- **feature**: 背景 / Goals / Non-goals / Acceptance Criteria / Constraints（固定方針の定型文をそのまま使う）/ Design notes / Tasks
- **refactor**: 背景（なぜ今やるか）/ スコープ（対象・非対象）/ リスク・影響範囲 / 完了条件 / Tasks

共通ルール:

- 設計判断が必要な内容は Design notes に **Options / Recommendation / Trade-offs** を書き、
  **Decision は空欄のまま**にする（決定はユーザーまたは議論で確定してから追記する）
- 根拠になった調査・監査・ADR があれば背景からパスで参照する
  （例: `docs/audits/001-current-state-audit.md`、ADR-002）
- 関連 Issue（前提・後続・同時実施が効率的なもの）があれば `#番号` で相互参照を書く
- 完了条件には検証方法を含める（typecheck / lint / test と手動確認の観点。`docs/development.md` 参照）
- 本文は日本語ベース

### 3. Issue 作成

- 本文は一時ファイル（scratchpad）に書き出し、`gh issue create --body-file` で作成する

```bash
gh issue create \
  --title "[Feature] <タイトル>" \
  --label "type:feature" \
  --body-file <scratchpadのファイル>
```

- 該当する `phase:N` ラベルがあれば併せて付与する
- `--draft` フラグがある場合は作成せず、本文案を提示してユーザーの確認を待つ
- 作成後は Issue URL を提示する

### 4. 関連ドキュメントの更新（該当する場合のみ）

- ロードマップ上のフェーズ・計画に紐づく Issue → `docs/roadmap.md` の該当表に行を追加する
- 監査・調査ドキュメント由来 → 元ドキュメント（`docs/audits/`）の Issue 一覧を更新する

## 完了条件

- Issue がテンプレート準拠の本文・正しいラベルで作成されている（または `--draft` で本文案を提示済み）
- 関連ドキュメントとの相互参照が取れている
