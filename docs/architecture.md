# システム構成

## フロントエンド

Next.js 16  
React 19  
TypeScript

スタイル：

Tailwind CSS

---

## バックエンド

Supabase

使用サービス

- Auth
- Postgres
- Storage

---

## 開発環境

Node.js 24 LTS

パッケージ管理

pnpm workspace

---

## テスト

Vitest  
React Testing Library

---

## CI

GitHub Actions

実行チェック

- lint
- typecheck
- test
- build

---

## ローカル開発

### Dockerなし

pnpm dev

### Dockerあり

pnpm docker:up