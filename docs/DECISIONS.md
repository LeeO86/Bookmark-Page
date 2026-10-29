# Decisions

## 2026-10-11 – V1 branch cut

**Decision:** Branch `v1` points at `ff2a32f` (`Update README.md`), the parent of the commit that added `AGENTS.md`. `docs/SPEC.md` was added in the following commit, so this cut is the last tree that contains neither file.

**Reason:** The V2 spec says to preserve V1 on branch `v1` before changing `master`. The milestone plan was adjusted to cut immediately before `AGENTS.md` and `docs/SPEC.md` were committed, so the legacy branch is the V1 application only.

## 2026-10-11 – Nuxt project root

**Decision:** The Nuxt project root is `app/`. Vue source lives in `app/app/` because that is Nuxt 4's default `srcDir`. The repository root is a pnpm workspace whose scripts delegate `pnpm lint`, `pnpm typecheck`, and `pnpm test` into `app/`.

**Reason:** The milestone plan asked for the Nuxt project root to be `/app/`. `AGENTS.md` requires those three commands from the repository root.

## 2026-10-11 – Dependency versions

**Decision:** Direct dependencies are the current stable releases that install together: Nuxt 4.6.1, Vue 3.5.43, Vue Router 5.4.0, Nuxt UI 4.11.3, Tailwind CSS 4.3.3, Zod 4.6.6, Drizzle ORM 0.45.4, drizzle-kit 0.31.11, better-sqlite3 13.0.3, Vitest 5.0.3, `@nuxt/test-utils` 4.3.3. Drizzle ORM 1.0 betas are not used. Node.js is 24.21.0, which satisfies Nuxt 4.6 (`^22.22.3 || ^24.15.0 || >=26`) and is the active LTS line. TypeScript is 6.0.3, not 7.0.2. pnpm is 10.33.3. Versions are pinned in `pnpm-lock.yaml`. `pnpm-workspace.yaml` allows build scripts for `better-sqlite3`, `esbuild`, `unrs-resolver`, and `vue-demi`.

**Reason:** The spec requires current stable versions, checked against current releases, and a lockfile. TypeScript 7.0.2 is newer, but `@typescript-eslint` 8.71 (via `@nuxt/eslint` 1.17.0) accepts only `typescript@>=4.8.4 <6.1.0`. pnpm 10 does not run dependency build scripts unless they are approved. `esbuild`, `unrs-resolver`, and `vue-demi` need those scripts. `better-sqlite3` is left unapproved because it loads the prebuilt binaries shipped in the package; approving it runs `node-gyp`, which the slim image cannot satisfy.

## 2026-10-11 – Baseline migration and database file

**Decision:** The first Drizzle migration (`0000_baseline`) creates no domain tables. Its SQL is `SELECT 1` so the migrator has one valid statement to record. On each connection the server sets `journal_mode = WAL` through the better-sqlite3 pragma API and creates the parent directory of the database file when it is missing. The default path is `/data/bookmark.db`, overridable with `DATABASE_PATH`. `MIGRATIONS_FOLDER` overrides the migrations directory; otherwise it is `drizzle` under the process working directory (`/app/drizzle` in the image).

**Reason:** The domain schema belongs to milestone M1. A comment-only migration file is not a statement the Drizzle migrator can run. WAL mode is required by the spec. The container data directory is `/data`, and local development needs a path that does not already exist.

## 2026-10-11 – Secret key and health response

**Decision:** Startup reads `BOOKMARK_SECRET_KEY`, `DATABASE_PATH`, and `MIGRATIONS_FOLDER` from `process.env` when the process boots. A missing or blank secret exits with status 1 and the message `BOOKMARK_SECRET_KEY is required`. The value is not logged, and its length is not checked yet. `GET /api/health` returns 200 `{ "status": "ok", "database": "ok" }` when `SELECT 1` succeeds, and 503 `{ "status": "error", "database": "error" }` when it does not. The body is a shared Zod schema.

**Reason:** The spec names `BOOKMARK_SECRET_KEY`, which is not Nuxt's `NUXT_` runtime-config prefix, and the value must be supplied to a built image without rebuilding. The health path and the liveness-plus-database check are specified; the JSON shape was agreed for this milestone. Key format is decided separately below.

## 2026-10-11 – Container user

**Decision:** The image runs as the `node` user that ships with `node:24.21.0-bookworm-slim` (uid 1000). `/data` is owned by that user and declared as a volume. The image listens on port 3000.

**Reason:** The spec requires a non-root container, a `/data` volume, and port 3000. That base image already uses uid 1000 for `node`, so a second group with the same id cannot be created. Uid 1000 still matches a typical host user for a bind mount.

## 2026-10-11 – M1 implementation choices

**Decision:** Record ids are UUIDv7. Sessions use Nuxt 4.6 `useSession`, sealed with the raw 32-byte `BOOKMARK_SECRET_KEY`. The session cookie is HttpOnly and SameSite=Lax, and Secure only when `SESSION_COOKIE_SECURE=true`. Secret values are stored as Base64 of a 12-byte IV, a 16-byte GCM tag, and the ciphertext. Passwords use argon2id with the `@node-rs/argon2` defaults (19 MiB, 2 passes, 1 thread) and must be at least 8 characters. The bootstrap admin is break-glass. Local login can be turned off with `LOCAL_LOGIN_ENABLED=false`. Trusted-header identities do not take over an existing local or OIDC username. A header user whose groups do not map becomes a viewer. Login failures are limited to 10 per 15 minutes per client IP. Unknown tag namespaces are created with the namespace name as the label, colour `#64748b`, sort 0, and the sidebar enabled. `is:` and `has:` are reserved query operators, so they are not tag namespaces; `has:link` and `has:check` are keywords rather than field keys. Scope sync updates attributes the payload manages and leaves other tags, links, fields, checks, and actions in place in every edit mode. User APIs cannot change locked entries, cannot change `field_ownership` managed paths, and cannot delete a managed entry unless its mode is `free`. Audit rows older than `AUDIT_RETENTION_DAYS` (default 365, `0` keeps everything) are deleted on startup. Icon uploads, favicon fetching, check execution, action execution, and `{{input.*}}` resolution are later milestones. `{{input.*}}` may be stored on action and check templates.

**Reason:** These are the spec's open choices, or the smallest behaviour that keeps automation from deleting user-added data and keeps Nuxt 4.6's request events. `nuxt-auth-utils` 0.5 targets an older h3 event, while Nuxt 4.6 already seals cookies and accepts a 32-byte password.

## 2026-10-11 – Secret key encoding

**Decision:** `BOOKMARK_SECRET_KEY` is standard Base64 (RFC 4648, with padding) that decodes to exactly 32 bytes. That decoded value is the AES-256-GCM key. Startup refuses when the variable is missing, blank, not valid Base64, or the wrong length.

**Reason:** AES-256-GCM needs a 32-byte key. Base64 was chosen so the env value is a single line without raw binary.

## 2026-10-11 – Later migrations

**Decision:** Domain migrations after `0000_baseline` are generated with `pnpm --dir app db:generate` from the Drizzle snapshot in `app/drizzle`. `0000_baseline` stays the first migration.

**Reason:** The baseline snapshot has no tables, so the next generate produces the real schema as the following migration instead of rewriting history.

## 2026-10-11 – Duplicate name and host

**Decision:** The entry editor treats a duplicate name or host as a confirmation step. The first save does not write when another entry already uses that name or host. The editor asks the user to confirm, and only the confirmed save is stored. Creating a public filter does not ask for a second confirmation.

**Reason:** A duplicate should be a deliberate choice, not a note beside a save that already happened. A public filter is already an explicit admin choice, so an extra dialog is not required.

## 2026-10-11 – Portal save, live updates, and logo

**Decision:** A duplicate name or host is HTTP 409 `confirm_duplicate` and does not write. The editor sends the same body again with `confirmDuplicates: true` only after the user confirms. Secret fields left out of a user update stay as they are, so a save or a history restore cannot replace a secret with `[redacted]`. `GET /api/v1/events` sends `entries` and `status` signals and no entry payload; the client refetches through the list endpoint, which still applies visibility, and it keeps the query, scroll position, and open editor. The logo is PNG or WebP, at most 512 KB. SVG uploads wait for the M3 sanitiser. The table uses letter avatars and the stored check status. Namespace rows are readable without signing in so a public sidebar can show labels and colours. `GET /api/v1/auth/options` reports whether local login and OpenID Connect are enabled, and does not include secrets.

**Reason:** Confirmation has to happen before the write. The editor does not have secret plaintext unless the user reveals it. A live-update event must not reveal an entry the list would hide. Icon files, favicon fetching, and check execution belong to later milestones.

## 2026-10-11 – Icons, favicons, and checks

**Decision:** Library icons use `lucide:<name>` and are read from the Lucide static set, whose names match the Feather names from V1. Uploaded icons use `upload:<id>` and are stored in the `icons.data` column. SVG uploads and fetched SVG favicons are sanitised before they are stored: scripts, event handlers, external references, and document-type declarations are removed. Favicon fetches follow only `http` and `https`, including private lab addresses, with TLS verification off unless an admin turns it on. Automatic fetches are skipped when `BOOKMARK_FAVICON_FETCH=0`. ICMP availability is detected with `ping`; a missing `CAP_NET_RAW` capability marks ICMP checks `unknown`. Browser checks lease visible stale checks and do not receive field values. `GET /metrics` is open unless `METRICS_TOKEN` is set. JSON expectations use a dot path, including numeric array indexes. Link buttons keep their text label beside the icon.

**Reason:** The icon set has to survive the production image without a database seed of every Lucide file. Sanitising SVG is required before storage. Lab devices are on private networks and often use private certificates, so those fetches stay allowed and unverified by default. Browser probes cannot see status codes or secret fields, and a missing ICMP capability must be visible instead of looking like an outage.

## 2026-10-12 – Action execution

**Decision:** Running an action is `POST /api/v1/entries/{id}/actions/{name}/execute`. When the action asks for confirmation, the request does nothing until `confirmed` is true. Runtime prompts are `{{input.<name>}}` and are declared on the action. Secret field values and password inputs are replaced with `[redacted]` in the response body and the audit diff. The shown body is cut at 4 KB. A user can run 30 actions per 15 minutes unless `ACTION_RATE_LIMIT` and `ACTION_RATE_WINDOW_MS` say otherwise. An action template is offered only when its query matches that visible entry, and an entry action of the same name wins. A token needs the `write` scope, or `admin` when the action requires an admin.

**Reason:** Device APIs are called by the server because the browser would be stopped by CORS. Confirmation has to be enforced on the server, not only in the page. The audit log must record the execution without keeping the secret that was sent.

## 2026-10-12 – Ansible collection

**Decision:** The collection is `ansible_collections/leeo86/bookmarks` version 2.0.0 and requires ansible-core 2.16 or newer. Its modules are GPL-3.0-or-later because they import Ansible. The application remains MIT. Field definitions can be updated with `PATCH /api/v1/fields/{id}` so the field module does not delete values to change a label. A repeated scope sync that matches the managed payload does not write, so checks keep their ids and Ansible reports unchanged. Action templates have no update route, so a changed template is deleted and created again. Removing one managed entry is `DELETE /api/v1/scopes/{scope}/entries/{externalKey}`, because the generic entry delete refuses anything the scope still owns. V1 group remarks are not imported; the group namespace label is "Group". V1 favicon URLs other than `img/icons/<name>.svg` are not stored as an icon override; the server fetches the favicon from the primary link. The entry module's check mode treats a masked secret as unchanged. `entries_sync` check mode uses the API dry run, which still compares secret values. Ansible's secret-name heuristic is turned off for `external_key` and field `key` because those are identifiers.

**Reason:** The spec requires an idempotent collection with check mode, a V1 import that does not read MySQL, and inventory sync. GPL applies to code that imports `ansible.module_utils`. Recreating a field would drop its values. Rewriting an unchanged entry reset check status. There is no first-class favicon override, and V1 has one namespace label rather than one remark per group.

## 2026-10-12 – Backup, CSV import, and releases

**Decision:** A backup is a zip whose `backup.json` is format 1, plus icon and favicon bytes. Secret field values are omitted unless the admin sets a passphrase. Those values are encrypted with PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM, and the archive stores a check value so a wrong passphrase fails before any write. Restore is `merge` or `replace`, and `dryRun` rolls the write back. Merge matches entries by id, then by scope and external key, and does not delete entries that are absent from the archive. Replace deletes the current rows and writes the archive. CSV import is admin-only. A repeated name or host is reported and not written until `confirmDuplicates` is true. A git tag `v2.x.y` publishes `ghcr.io/leeo86/bookmark-page` as `2.x.y`, `2.x`, `2`, and `latest` for `linux/amd64` and `linux/arm64`.

**Reason:** The spec asks for a zip of the data and icons, secrets only on request, and a restore preview. Re-encrypting with a passphrase keeps the server key out of the file. CSV duplicates follow the same confirmation rule as the entry editor. Image tags match the spec’s `2.x.y`, `2.x`, `2`, and `latest` names.

## 2026-10-12 – Portal theme, views, and security headers

**Decision:** Development responses add `'unsafe-inline'`, `'unsafe-eval'`, and websocket sources so the Vite client can run. Production responses do not. V1 theme swatches are the accent seeds (red `#804040`, yellow `#808040`, pink `#804080`, green `#408040`, cyan `#408080`, blue `#404080`, grey `#6c757d`). The generated 50–950 scale is applied by overriding `--ui-color-primary-*`, `--ui-primary`, and `--ui-color-neutral-*`. Yellow and grey text use a darker generated step so contrast stays at least 4.5:1. `style-src` allows `'unsafe-inline'` because Nuxt UI injects component styles. The page policy is not sent on `/api/icons`, which keeps `default-src 'none'`. Production pages add a `sha256` source for each inline boot script, including the colour-mode snippet and the Nuxt runtime config, so `script-src` can stay `'self'` without `'unsafe-inline'`. Signed-in colour mode and per-tab view overrides live in `user_preferences`. Anonymous visitors use the `bp-color-mode` and `bp-theme` cookies. A filter's `view_mode` is the tab default. The `view` query parameter wins over that default. The name, icon, and description are anchors to the primary URL; a stretched link over the table row is not used. Secret columns stay masked in list payloads and reveal through the existing endpoint. The browser-tab icon is served from `/api/v1/favicon`.

**Reason:** The portal has to follow the admin accent without a colour flash, keep keyboard and pointer behaviour on real links, and show secrets only after an audited reveal. Inline component styles cannot satisfy a fully locked `style-src`. Multiple CSP headers are combined by the browser, so the icon route must not also receive the page policy.

## 2026-10-12 – Start page

**Decision:** The portal is a start page. Named accent presets copy the vivid Tailwind scales (Yellow uses amber, Grey uses slate) into `--ui-color-primary-*`. The earlier V1 swatches (`#804040`, `#404080`, and the rest) are no longer the seeds; a custom hex still keeps its chroma and only changes lightness. Filled controls and accent text pick a scale step that reaches 4.5:1. The page background is the setting `background`: `gradient` (default), `tint`, or `plain`. Fetched favicons sit on a light plate (`--bp-icon-plate`). Lucide icons are CSS masks in `currentColor`. Reachability changes only that icon: down is greyscale with a red dot, unknown adds an amber dot, and no check adds nothing. `state:online`, `state:offline`, and `state:unknown` are query nodes, not stored tags. `state:unknown` requires a check; `is:unknown` still matches an entry with no checks. Tiles are the default for new filters and for All. The `filters.view_mode` column default stays `list` so existing rows and old backups are unchanged. Edit mode is `sessionStorage` key `bp-edit-mode` for the browser tab, not a server preference. Facet visibility is `user_preferences.facets_open` or the `bp-facets` cookie. Tile size is `user_preferences.tile_size`. Inter is the variable face from `@fontsource-variable/inter`, loaded by `@nuxt/fonts` 1.0.1 with the `npm` provider so the build does not call Google. The CSS family is `Inter Variable`, which supplies weights 550 and 650. The whole tile or card is one primary link; secondary links and secret controls sit above it. Admin navigation is the collapsible sidebar plus the navbar toggle (`Open sidebar` / `Close sidebar`). There is no second link row on the settings page and no global check-defaults template.

**Reason:** The V1 seeds were dark theme values, so Blue rendered as navy and Red as salmon. A start page should lead with the favicon and the click, and keep editing and filters out of the way until they are asked for. Status columns made the page look like a monitor. The virtual `state` namespace answers "what is offline?" without writing tags. Local font files keep the production page on `font-src 'self'`. `img-src` also allows `data:` because the component library paints its icons as SVG data URLs; scripts stay limited to this origin.

## 2026-10-25 – App shell

**Decision:** The accent wash paints the banner only. The content area uses a neutral surface, stone for warm accents and slate for cool ones, unless the admin picks a neutral after the preset. Cards are the default view. The side nav lists views and facets; the filter slide-over is unused and `facets_open` stays in the database. Sidebar collapse is `user_preferences.sidebar_collapsed` or the `bp-sidebar` cookie. Per-tab grouping is `group_modes`. A tag's `display_label` is separate from its query token. The logo accepts PNG, JPEG, WebP, and sanitised SVG up to 1 MB. Below 768px the list stays a list. Edit controls and drag handles are visible only in edit mode. Focus rings use `:focus-visible`.

**Reason:** The round-2 page read as a tinted poster. The Linkwarden shell keeps the start-page behaviour and puts navigation where it can stay out of the cards. Display labels let `control-a` read as "Control A" without changing saved queries.

## 2026-10-29 — Readiness corrections

**Decision:** Correct the fourteen findings from the ICM readiness review on `fix/v2-readiness-2026-10-29`, based on the separate V2 branch. The user's request to fix all reviewed problems authorizes this corrective batch; V1 and master remain outside the coding scope.

Current field permissions govern historical responses and restore inputs, including definitions deleted or changed to secret. Hidden fields/actions survive ordinary editor saves, and forged writes to them are denied. Token scope checks apply to viewer-level writes too; global view management and admin-token issuance require admin scope. Child tokens cannot outlive the presenting token.

The drawer retains complete HTTP requests and exposes the advanced request options. Server HTTP checks use the same strict placeholder resolver for URLs, headers and bodies as actions. Every nonempty secret, regardless of length, is redacted from action output and audit URLs. Explicit link reveal is a signed-in, field-authorized, audited POST and returns a non-cacheable URL; ordinary responses remain masked.

The page CSP permits HTTP(S) connections because browser checks intentionally contact lab-device origins. Script sources stay restricted. A detected policy block is unknown. Tag quoting uses `namespace:"quoted value"`, preserving the distinction from a free-text phrase. Personal views use the active sidebar's edit dialog and move controls.

Backup format 1 gains optional preferences, defaulting to an empty list for old archives. No database schema migration is necessary. V1 values are copied exactly, populated unnamed columns get fallback labels, and supported non-HTTP schemes retain their type and host. Managed favicon work is deferred until commit and skipped for dry runs and unchanged upserts. Release publishing now depends on the reusable CI checks.

**Reason:** Passing baseline tests did not cover the reproduced permission and data-loss failures. Regression tests exercise malicious requests, historical permission changes, real HTTP requests, browser saves and migration edge cases. The user requested all findings be corrected together rather than another milestone implementation cycle.

## 2026-10-29 — Dependency security maintenance

**Decision:** Update Nuxt from 4.6.1 to the current patch 4.6.3 and pin targeted overrides for Undici 8.12.2 and fontless's esbuild 0.28.2. Registry metadata and GitHub advisories were checked on this date. The deepmerge 4.3.1 build dependency has no published fixed version for GHSA-gcqx-w48m-w2h4; apply a lockfile-bound pnpm patch rejecting prototype-bearing keys on both target and source, with an exploit regression test. Docker copies the patch before frozen installation. Other direct dependency versions remain pinned.

**Reason:** A fresh registry audit found additional advisories after the original review. Nuxt's patch removes the affected Nuxt/serializer/devtools dependencies; the targeted overrides address the fetch/font paths without a broad major-version upgrade. The upstream deepmerge advisory will remain visible to version-only audit tools even though the installed code is patched. No advisory is silently ignored.
