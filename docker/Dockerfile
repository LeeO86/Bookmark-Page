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

# The Node image already provides user node (uid 1000).
RUN mkdir -p /data && chown node:node /data

WORKDIR /app
COPY --from=build --chown=node:node /src/app/.output ./.output
COPY --from=build --chown=node:node /src/app/drizzle ./drizzle

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/data/bookmark.db
ENV MIGRATIONS_FOLDER=/app/drizzle

USER node
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", ".output/server/index.mjs"]
