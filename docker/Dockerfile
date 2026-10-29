# syntax=docker/dockerfile:1

FROM node:24.21.0-bookworm-slim AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate

WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/package.json
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
  && mkdir -p /src/docker-lucide \
  && cp -aL /src/app/node_modules/lucide-static/icons /src/docker-lucide/icons

FROM node:24.21.0-bookworm-slim AS runner

# The Node image already provides user node (uid 1000).
# iputils-ping is used for ICMP checks when CAP_NET_RAW is granted.
RUN apt-get update \
  && apt-get install -y --no-install-recommends iputils-ping \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data \
  && chown node:node /data

WORKDIR /app
COPY --from=build --chown=node:node /src/app/.output ./.output
COPY --from=build --chown=node:node /src/app/drizzle ./drizzle
COPY --from=build --chown=node:node /src/docker-lucide/icons ./node_modules/lucide-static/icons

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/data/bookmark.db
ENV MIGRATIONS_FOLDER=/app/drizzle

USER node
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", ".output/server/index.mjs"]
