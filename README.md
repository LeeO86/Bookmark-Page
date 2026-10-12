# Bookmark-Page

![A quiet control room at dusk, with transmission towers beyond the window and status lights on the desk](docs/images/readme-banner.jpg)

V2 of Bookmark-Page, a device portal for broadcast engineering labs.

- V1 (legacy) is on branch `v1`. The legacy image is `adihilber/bookmark-page`.
- V2 images are published to `ghcr.io/leeo86/bookmark-page`. A git tag `v2.x.y` publishes `2.x.y`, `2.x`, `2`, and `latest`.

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

The portal is the home page. Icons come from Lucide, an upload, a fetched favicon, or a letter. Server checks and browser checks update the status dot. Actions run on the server from the entry drawer, including templates whose query matches the entry. `GET /metrics` exposes Prometheus text. The query bar and the active tab are stored in the URL. Tag shortcuts add `AND` (click), `OR` (Shift-click), or `NOT` (Alt-click). `/` focuses the query, `Esc` clears it, the arrow keys move the selection, and Enter opens the primary link. Saving an entry that reuses a name or host asks for confirmation before the write. Admins open `/admin` for the title, claim, logo, colours, users, field definitions, tag namespaces, API tokens, and Ansible scopes. Logos are PNG or WebP, up to 512 KB. `GET /api/v1/events` is the live-update stream.

## Ansible

The collection `leeo86.bookmarks` is in `ansible_collections/leeo86/bookmarks`. It manages entries, scopes, tags, fields, filters, and action templates, and it includes `inventory_sync` and `v1_import` roles. See `docs/ansible.md`.

## Documentation

- `docs/installation.md`
- `docs/configuration.md`
- `docs/query-language.md`
- `docs/ansible.md`
- `docs/migration-v1.md`
- `docs/api.md`
- `docs/auth-entra.md`
- `docs/auth-keycloak.md`
- `docs/auth-header-proxy.md`
- `docs/checks-and-actions.md`

Admins download a backup and import CSV from `/admin`. A backup includes secret values only when a passphrase is set. Restore can merge or replace, and it can preview the change first.

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
