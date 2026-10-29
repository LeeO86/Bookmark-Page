# Installation

Bookmark-Page V2 is one Node.js process. The container listens on port 3000 and stores SQLite under `/data`.

## Requirements

- Node.js 24.15 or newer. `.nvmrc` pins 24.21.0.
- pnpm 10.33.3.

## Local development

```sh
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put that value in `.env` as `BOOKMARK_SECRET_KEY`. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` to create the first break-glass admin.

```sh
pnpm install
pnpm dev
```

The app is http://127.0.0.1:3000. Health is `GET /api/health`. The process exits when `BOOKMARK_SECRET_KEY` is missing, blank, or not 32 bytes of standard Base64.

## Container

```sh
docker compose --env-file .env -f docker/docker-compose.yml up --build
```

The image runs as the non-root `node` user, uid 1000. The database file is `/data/bookmark.db` on the `bookmark-data` volume.

`docker/docker-compose.traefik.yml` is the same service with Traefik labels. It expects an external Docker network named `traefik`.

Pull the v2.0.0 release with `docker pull ghcr.io/leeo86/bookmark-page:2.0.0`. Keep the existing `/data` volume and `BOOKMARK_SECRET_KEY` when updating an installation.

Release images are published to `ghcr.io/leeo86/bookmark-page`. A git tag `v2.x.y` publishes image tags `2.x.y`, `2.x`, `2`, and `latest`.

## Ansible

The collection is `ansible_collections/leeo86/bookmarks`. See `docs/ansible.md`.
