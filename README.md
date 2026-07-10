# 坂道トーク帖

坂道メンバーから届いた言葉と時間を残す。私だけの記録帖。

外部アプリなどで受け取ったトークを保存・閲覧・検索するための個人用 Web アプリ。

## Development

- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Initial User

初回ログイン用ユーザーは Supabase Admin API で 1 回だけ作成する。

1. `.env.local` に `SUPABASE_SERVICE_ROLE_KEY` を追加
2. 次を実行

```bash
pnpm user:create-initial -- --email you@example.com --password 'your-password'
```

このスクリプトは `email_confirm: true` でユーザーを作成する。
`SUPABASE_SERVICE_ROLE_KEY` はサーバー専用で、クライアント側では使用しない。

## Docs

- docs/requirements.md
- docs/architecture.md
- docs/database.md
- docs/development.md

## Deployment

- `main` への更新をトリガーに自動デプロイする運用
- リポジトリ内の GitHub Actions は CI のみを担当し、デプロイ自体はデプロイ先プラットフォーム連携で実行する
