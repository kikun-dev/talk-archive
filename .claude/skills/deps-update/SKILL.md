---
name: deps-update
description: 依存パッケージを更新する。「依存更新して」「パッケージ更新」「pnpm update」などで使う。pnpm outdatedの確認→semver範囲内の更新→typecheck/lint/test/build→更新サマリー付きPR作成まで一括で行う。
argument-hint: "[--major]（メジャー更新も含める場合）"
---

# 依存パッケージ更新

依存を更新し、検証済みの状態で PR を作る。

## 引数

- `--major`（省略可）: メジャーバージョン更新も対象に含める。
  **デフォルトでは semver 範囲内（patch / minor）のみ**

## 手順

### 1. 現状把握

- `main` から `chore/deps-update-YYYYMMDD` ブランチを作成する
- `pnpm outdated` で更新候補を一覧し、patch / minor / major に分類して提示する

### 2. 更新

- **patch / minor**: `pnpm update` で semver 範囲内を更新する
- **major**（`--major` 指定時のみ）: 1パッケージずつ更新する
  - 更新前に breaking changes を確認する（リリースノート・migration ガイド）
  - 特に `next` / `react` / `@supabase/*` / `tailwindcss` は影響が大きいため、
    破壊的変更の要点をユーザーに提示し、確認を取ってから進める
  - コード修正が必要な major 更新は、このスキルの範囲で無理に進めず
    Issue 化（`/design-issue`）を提案する
- lockfile（`pnpm-lock.yaml`）の差分が意図した範囲か確認する

### 3. 検証

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

失敗した場合は原因パッケージを特定し、そのパッケージだけ更新を除外（バージョンを戻す）して
残りで通す。除外したものは PR に「保留」として理由付きで記録する。

### 4. PR 作成

- `/pr` スキルの手順に従う
- PR 本文に更新サマリー表を含める:

```markdown
| パッケージ | 変更 | 種別 | 備考 |
|---|---|---|---|
| next | 16.1.6 → 16.1.8 | patch | |
| ... | | | |

### 保留（更新しなかったもの）
| パッケージ | 現在 → 最新 | 理由 |
|---|---|---|
```

- 依存更新は設計判断を含まない定期メンテナンス PR のため、`Closes #N` は不要
  （Related があれば書く）。PR 本文に定期メンテナンスである旨を書く

## 完了条件

- 更新後に typecheck / lint / test / build が通っている
- 更新・保留の内訳が PR に記録されている
