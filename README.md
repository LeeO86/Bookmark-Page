# Bookmark-Page

V2 of Bookmark-Page, a device portal for broadcast engineering labs.

- V1 (legacy) is on branch `v1`. The legacy image is `adihilber/bookmark-page`.
- V2 images are published to `ghcr.io/leeo86/bookmark-page`. This milestone builds the image locally and in CI. The release workflow that pushes tags comes later.

## Requirements

- Node.js 24.15 or newer (`.nvmrc` pins 24.21.0)
- pnpm 10.33.3 (`packageManager` in `package.json`)

## Local development

```sh
cp .env.example .env
# Set BOOKMARK_SECRET_KEY in .env
pnpm install
pnpm dev
```

- App: http://127.0.0.1:3000
- Health: http://127.0.0.1:3000/api/health

The process exits unless `BOOKMARK_SECRET_KEY` is standard Base64 that decodes to 32 bytes. Generate one with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` to create the first break-glass admin. SQLite data for local development is `app/data/bookmark.db` when `DATABASE_PATH` is left as in `.env.example`.

The HTTP API is under `/api/v1`. `GET /api/v1/openapi.json` is the OpenAPI document and `/api/v1/docs` lists the routes. Authentication is a session cookie, `Authorization: Bearer`, or trusted proxy headers. See `.env.example`.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
```

## Container

```sh
docker compose --env-file .env -f docker/docker-compose.yml up --build
```

The container listens on port 3000 and stores the database on the `bookmark-data` volume at `/data/bookmark.db`. It runs as the image's non-root `node` user (uid 1000).

`docker/docker-compose.traefik.yml` is the same service with Traefik labels. It expects an external Docker network named `traefik`.

## License

Copyright 2020 Adrian Hilber. Licensed under MIT. See `LICENSE`.
