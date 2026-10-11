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
