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

pnpm

アプリ構成

単一の Next.js アプリをリポジトリ直下で管理する

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

`pull_request` と `main` への `push` で実行する。

---

## デプロイ

デプロイ先

Vercel

運用方針

- `main` 更新時に自動デプロイする
- リポジトリ内ではデプロイ workflow を持たず、GitHub Actions は CI のみを担当する
- 本番反映の単位は `main` にマージされたコミットとする

---

## ローカル開発

### Dockerなし

pnpm dev

### Dockerあり

pnpm docker:up
