FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json pnpm-workspace.yaml .nvmrc ./
COPY apps/web/package.json ./apps/web/package.json

RUN corepack enable && corepack prepare pnpm@9.15.5 --activate

RUN pnpm install --filter web... --frozen-lockfile=false

COPY . .

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
