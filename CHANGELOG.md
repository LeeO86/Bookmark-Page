# Changelog

## 2.2.1 — 2026-11-01

First public release of the combined automation and favicon improvements. The
2.2.0 publishing workflow was stopped during final validation; its source tag is
retained unchanged.

- Keep secret-backed bookmark links unresolved during automatic favicon work.
  Never decrypt secret fields for background discovery or persist their values in
  retry sources. Explicit public favicon overrides remain available.

## 2.2.0 candidate — 2026-11-01

Application and Ansible collection ship at the same version. Existing module
arguments and canonical icon references remain supported.

- Decode percent-encoded/Base64 inline SVG, PNG, WebP and ICO favicons, including
  expert entry overrides; infer MIME from the URI and sanitise/validate before storage.
- Try multiple linked/manifest icons and `/favicon.ico`. Prefer normal icons over
  Safari masks; retain strict SVG sanitising and reject non-image responses.
- Persist favicon failures and retry after 5 minutes, 1 hour and then every 6 hours,
  independently of device checks. Keep last good images, expose editor diagnostics,
  and add admin refresh-missing action with bounded concurrency.
- Reconcile persistent environment/file bootstrap admin tokens at every start.
  Existing databases, rotation, removal and unchanged-start no-ops are supported.
- Add Ansible session login via username/password and environment fallbacks.
- Add idempotent `settings`, `icon`, and `filters_sync` modules with check mode and
  diffs; preserve `site_branding` and all existing module arguments.
- Support branding image paths, sanitised content hashes, in-place icon replacement,
  exact `upload-name:` entry/link references, and versioned cache URLs with SSE updates.
- Synchronise shared tabs by explicit scope/external key; purge preserves manual,
  personal and other-scope tabs. Add default-off public visibility for new shared tabs.
- Add the complete `bookmarks` module-defaults action group and `filter.view_mode`.
- Accept tag display labels in bulk sync; reject conflicting labels atomically.
- Extend backups, API documentation/OpenAPI and automated regressions for the additions.

Earlier release notes are available in the GitHub releases.
