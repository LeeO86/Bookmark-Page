# Agent instructions – Bookmark-Page V2

You are implementing V2 of Bookmark-Page. The full specification is `docs/SPEC.md`.
It is the single source of truth; read the relevant sections before every task.

## Working rules

- Work one milestone at a time (SPEC §15). Before coding, write a short plan for the
  milestone and wait for approval. After finishing, report and stop.
- Do not invent requirements and do not silently drop any. If the spec is unclear,
  contradictory or technically unwise, ask. Record every decision and deviation in
  `docs/DECISIONS.md` (date, decision, reason).
- Use current stable versions of all dependencies and check their official docs; do not
  rely on remembered APIs. Pin versions in lockfiles.
- English only: code, comments, UI, docs, commit messages.
- TypeScript strict, no `any` without a comment explaining why. Shared Zod schemas between
  client and server.
- All database access through Drizzle with parameters. Never build SQL from strings.
- Schema changes only through migrations. Never drop data outside a migration.
- Security is not optional: visibility rules (SPEC §10.3), secret handling (§4.5), trusted
  proxy check (§10.1) and SVG sanitising (§6) must have tests. Never weaken a permission
  check to make a test or feature pass.
- No TODOs, stubs or placeholder implementations left in a milestone you report as done.
  If something is out of scope for the milestone, list it in the report.
- Tests must pass before you report a milestone done: `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, and from M5 on `ansible-test sanity`.
- Small, logical commits with Conventional Commit messages.
- Keep `README.md`, `.env.example` and `docs/` in sync with the code.

## Milestone report format

1. What was built (short list)
2. How to run and verify it
3. Deviations from the spec and why
4. Open questions for the next milestone

## Cursor Cloud specific instructions

This tree is still the V1 PHP application. Cloud Agent VMs do not run systemd, so the environment `start` script launches `dockerd` itself with the `fuse-overlayfs` storage driver and the legacy iptables backend. Legacy iptables is required so containers on the Compose network can reach each other.

`start` runs `docker compose -f docker-compose.dev.yml` plus an override that pins `mysql:8.0` and `--innodb-strict-mode=0`. The unpinned `mysql` image tag currently resolves to MySQL 26, which rejects `dump/*.sql` (`ROW_FORMAT=COMPACT`, error 1118).

- App: http://127.0.0.1:8080
- phpMyAdmin: http://127.0.0.1:8000
- Database `bookmark-db`, user `bookmark`, password `bookpass` (hostname `db` on the Compose network)
- `./www` is bind-mounted into Apache, so PHP and static edits show up without an image rebuild
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` belong to the V2 rewrite and are not on this tree
