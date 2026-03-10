FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml .nvmrc ./

RUN corepack enable && corepack prepare pnpm@9.15.5 --activate

RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
