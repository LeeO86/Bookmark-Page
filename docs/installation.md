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

The bundled app icon appears in the banner automatically, including on existing installations with no custom logo. An uploaded site logo takes precedence.

The image runs as the non-root `node` user, uid 1000. The database file is `/data/bookmark.db` on the `bookmark-data` volume.

`docker/docker-compose.traefik.yml` is the same service with Traefik labels. It expects an external Docker network named `traefik`.

Pull the v2.0.0 release with `docker pull ghcr.io/leeo86/bookmark-page:2.0.0`. Keep the existing `/data` volume and `BOOKMARK_SECRET_KEY` when updating an installation.

Release images are published to `ghcr.io/leeo86/bookmark-page`. A git tag `v2.x.y` publishes image tags `2.x.y`, `2.x`, `2`, and `latest`.

## Ansible

The collection is `ansible_collections/leeo86/bookmarks`. See `docs/ansible.md`.

## Offline labs

The UI serves its Lucide icons, Inter font files and default branding from the app origin. The complete Lucide collection is bundled on the server so icon names selected at runtime also work. The browser does not fall back to Iconify, and the font module uses installed packages with remote providers disabled.

Package installation, pulling base images and installing operating-system packages require access to their registries or a populated local mirror/cache. The application compilation step in `docker/Dockerfile` explicitly runs with networking disabled. Optional device checks, favicon discovery, actions and identity providers use their configured target services.

Verify a locally built production image without any container network access:

```sh
docker build -f docker/Dockerfile -t bookmark-page:offline .
bash docker/test-offline.sh bookmark-page:offline
```

The smoke test uses disposable data and checks the page, navigation and dynamic Lucide icons, the entry-icon endpoint, every WOFF2 font referenced by the page or built CSS, and local rejection of an unbundled icon collection. CI runs the same test. The Playwright suite additionally renders UI icons and loads Inter with external browser requests rejected.
