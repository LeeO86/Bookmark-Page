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
