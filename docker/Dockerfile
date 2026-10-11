# syntax=docker/dockerfile:1

FROM node:24.21.0-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24.21.0-bookworm-slim AS runner

RUN groupadd --system --gid 1000 bookmark \
  && useradd --system --uid 1000 --gid bookmark --home-dir /app --shell /usr/sbin/nologin bookmark \
  && mkdir -p /data /app \
  && chown bookmark:bookmark /data /app

WORKDIR /app
COPY --from=build --chown=bookmark:bookmark /src/app/.output ./.output
COPY --from=build --chown=bookmark:bookmark /src/app/drizzle ./drizzle

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/data/bookmark.db
ENV MIGRATIONS_FOLDER=/app/drizzle

USER bookmark
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", ".output/server/index.mjs"]
