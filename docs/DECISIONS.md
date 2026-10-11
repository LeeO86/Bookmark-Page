# Decisions

## 2026-10-11 – V1 branch cut

**Decision:** Branch `v1` points at `ff2a32f` (`Update README.md`), the parent of the commit that added `AGENTS.md`. `docs/SPEC.md` was added in the following commit, so this cut is the last tree that contains neither file.

**Reason:** The V2 spec says to preserve V1 on branch `v1` before changing `master`. The milestone plan was adjusted to cut immediately before `AGENTS.md` and `docs/SPEC.md` were committed, so the legacy branch is the V1 application only.

## 2026-10-11 – Nuxt project root

**Decision:** The Nuxt project root is `app/`. Vue source lives in `app/app/` because that is Nuxt 4's default `srcDir`. The repository root is a pnpm workspace whose scripts delegate `pnpm lint`, `pnpm typecheck`, and `pnpm test` into `app/`.

**Reason:** The milestone plan asked for the Nuxt project root to be `/app/`. `AGENTS.md` requires those three commands from the repository root.

## 2026-10-11 – Dependency versions

**Decision:** Direct dependencies are the current stable releases that install together: Nuxt 4.6.1, Vue 3.5.43, Vue Router 5.4.0, Nuxt UI 4.11.3, Tailwind CSS 4.3.3, Zod 4.6.6, Drizzle ORM 0.45.4, drizzle-kit 0.31.11, better-sqlite3 13.0.3, Vitest 5.0.3, `@nuxt/test-utils` 4.3.3. Drizzle ORM 1.0 betas are not used. Node.js is 24.21.0, which satisfies Nuxt 4.6 (`^22.22.3 || ^24.15.0 || >=26`) and is the active LTS line. TypeScript is 6.0.3, not 7.0.2. pnpm is 10.33.3. Versions are pinned in `pnpm-lock.yaml`. `pnpm-workspace.yaml` allows build scripts for `better-sqlite3`, `esbuild`, `unrs-resolver`, and `vue-demi`.

**Reason:** The spec requires current stable versions, checked against current releases, and a lockfile. TypeScript 7.0.2 is newer, but `@typescript-eslint` 8.71 (via `@nuxt/eslint` 1.17.0) accepts only `typescript@>=4.8.4 <6.1.0`. pnpm 10 does not run dependency build scripts unless they are approved, and better-sqlite3 needs its install script.

## 2026-10-11 – Baseline migration and database file

**Decision:** The first Drizzle migration (`0000_baseline`) creates no domain tables. Its SQL is `SELECT 1` so the migrator has one valid statement to record. On each connection the server sets `journal_mode = WAL` through the better-sqlite3 pragma API and creates the parent directory of the database file when it is missing. The default path is `/data/bookmark.db`, overridable with `DATABASE_PATH`. `MIGRATIONS_FOLDER` overrides the migrations directory; otherwise it is `drizzle` under the process working directory (`/app/drizzle` in the image).

**Reason:** The domain schema belongs to milestone M1. A comment-only migration file is not a statement the Drizzle migrator can run. WAL mode is required by the spec. The container data directory is `/data`, and local development needs a path that does not already exist.

## 2026-10-11 – Secret key and health response

**Decision:** Startup reads `BOOKMARK_SECRET_KEY`, `DATABASE_PATH`, and `MIGRATIONS_FOLDER` from `process.env` when the process boots. A missing or blank secret exits with status 1 and the message `BOOKMARK_SECRET_KEY is required`. The value is not logged, and its length is not checked yet. `GET /api/health` returns 200 `{ "status": "ok", "database": "ok" }` when `SELECT 1` succeeds, and 503 `{ "status": "error", "database": "error" }` when it does not. The body is a shared Zod schema.

**Reason:** The spec names `BOOKMARK_SECRET_KEY`, which is not Nuxt's `NUXT_` runtime-config prefix, and the value must be supplied to a built image without rebuilding. Encryption in M1 will define the key format. The health path and the liveness-plus-database check are specified; the JSON shape was agreed for this milestone.

## 2026-10-11 – Container user

**Decision:** The image runs as user `bookmark`, uid 1000, gid 1000. `/data` is a volume. The image listens on port 3000.

**Reason:** The spec requires a non-root container, a `/data` volume, and port 3000. Uid 1000 matches a typical host user when a bind mount is used later.
