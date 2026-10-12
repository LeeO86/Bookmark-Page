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
