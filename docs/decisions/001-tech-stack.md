# ADR-001: 技術スタック選定

## Status

Accepted

## Context

個人用トークアーカイブアプリを新規開発するにあたり、技術スタックを選定する必要がある。
要件は以下の通り。

- 単一ユーザー向けの個人用 Web アプリ
- テキスト・画像・動画・音声の保存と検索
- 認証必須
- 開発者は個人（AI 駆動開発）

## Options

### フロントエンド

- **A: Next.js + React + TypeScript** — フルスタックフレームワーク。SSR/SSG、Server Actions、App Router による統合的な開発体験。
- **B: Remix + React + TypeScript** — Web 標準寄りのフルスタックフレームワーク。
- **C: SvelteKit + TypeScript** — Svelte ベース。軽量だがエコシステムが小さい。

### バックエンド / BaaS

- **A: Supabase** — Postgres + Auth + Storage を統合。セルフホスト可能。
- **B: Firebase** — Google 製 BaaS。NoSQL（Firestore）ベース。
- **C: 自前 API（Express / Hono）** — 柔軟だが開発コストが高い。

### デプロイ

- **A: Vercel + Supabase Cloud** — Next.js との統合が最も深い。
- **B: セルフホスト** — 自由度が高いが運用コストがかかる。

## Evaluation

| 評価軸 | Next.js + Supabase + Vercel | Remix + Firebase | 自前構成 |
|--------|----------------------------|------------------|----------|
| 開発速度 | ◎ Server Actions で統合的 | ○ | △ 構築コスト大 |
| 型安全性 | ◎ TypeScript + 型生成 | ○ | ○ |
| メディア対応 | ◎ Storage + Image 最適化 | ○ | △ 自前実装 |
| 認証 | ◎ Supabase Auth | ◎ Firebase Auth | △ 自前実装 |
| 全文検索 | ○ Postgres pg_trgm | △ Firestore 制限 | ◎ 自由選択 |
| 運用コスト | ◎ マネージド | ◎ マネージド | △ 運用負荷 |
| 学習コスト | ○ | ○ | △ |

## Decision

**Next.js 16 + React 19 + TypeScript + Tailwind CSS + Supabase + Vercel** を採用する。

理由:
- Server Actions と App Router により、フロントエンドとバックエンドを統合的に開発できる
- Supabase が Auth / Postgres / Storage を一括提供し、個人開発の構築コストを最小化できる
- Postgres ベースのため pg_trgm による日本語部分一致検索が可能
- Vercel との統合が深く、デプロイが容易

## Consequences

- Supabase Cloud の制約を受ける（pgroonga 等の拡張が使えない）
- Next.js のバージョンアップに追従する必要がある
- Vercel の無料枠を超えた場合のコストが発生する可能性がある
