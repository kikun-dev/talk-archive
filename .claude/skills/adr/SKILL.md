---
name: adr
description: 設計判断をADR（Architecture Decision Record）としてdocs/decisions/に記録する。「ADR化して」「ADRに残して」「設計判断を記録して」などで使う。採番→テンプレート準拠の作成→発端Issueとの相互参照まで一括で行う。
argument-hint: "<記録したい設計判断>"
---

# ADR 起票

設計判断を `docs/decisions/` に ADR として記録する。

## 昇格基準の確認（作成前に必ず）

`CLAUDE.md` の更新ルールに照らし、ADR にすべき判断か確認する:

- 長期に効く設計判断である（今後も参照される可能性が高い）
- 迷いが再発しそうな決定
- 「なぜそうしたか」を残さないと将来破綻しそうな決定

該当しない場合（一時的な判断・Issue 内で完結する判断）は、Issue の Decision 欄への記録を提案して止める。
「今後ずっと守る規則」は ADR ではなく `rules/` への追記を提案する。

## 手順

### 1. 採番とタイトル

- `docs/decisions/` の既存ファイルから次番号を決める（3桁ゼロ埋め: `001`〜。`000-template.md` は除外）
- ファイル名: `NNN-<kebab-case-slug>.md`（例: `003-pending-media-records.md`）

### 2. 本文の作成

`docs/decisions/000-template.md` のフォーマットに従う（`001-tech-stack.md`, `002-database-schema.md` が実例）:

```markdown
# ADR-NNN: <タイトル>

## Status

Accepted

## Context

<前提・課題・なぜ判断が必要か>

## Options

- **A:** 概要
- **B:** 概要

## Evaluation

| 評価軸 | A | B |
|--------|---|---|
| 可読性 |   |   |
| 変更容易性 |   |   |
| 実装コスト |   |   |

## Decision

<採用した案と理由>

## Consequences

<この決定によって生じる影響・トレードオフ>
```

書き方の注意:

- Options には「他の選択肢ではなくなぜこれか」が分かる程度の比較を含める
  （Issue の Design notes に Options / Trade-offs があればそこから要約し、Issue を参照する）
- Consequences のトレードオフを省略しない（トレードオフのない決定は ADR にする必要がない）
- 日本語ベースで記載する

### 3. 関連ドキュメントの更新

- 決定の発端になった Issue があれば、Issue の Decision 欄に「ADR-NNN に昇格」と追記する（`gh issue edit` またはコメント）
- 決定が既存ドキュメント（`docs/architecture.md` / `docs/database.md` / `docs/requirements.md`）と矛盾する場合は、そちらも更新する
- 決定が今後の規則になる場合は `rules/` への追記も提案する

## 完了条件

- `docs/decisions/NNN-*.md` がテンプレート準拠で作成されている
- 発端 Issue との相互参照が取れている（該当する場合）
- 矛盾する既存ドキュメントが更新されている（該当する場合）
