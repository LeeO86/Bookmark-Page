# Changelog

## 2.4.2 — 2026-11-06

- Send a compatible image Accept header and decode bounded gzip/deflate image responses in controller downloads and server requests, including unsolicited compression.
- Add `use_proxy` to favicon URL downloads/lookup and `v1_import_favicon_use_proxy` to migration; defaults keep proxy handling enabled.
- Keep supplied favicon diagnostics successful when a queued/running fetch fails later, and repair existing supplied-slot error states without changing bytes/provenance.
- Schedule server checks never-run first and oldest checked time next; refill slots immediately and expose overdue/capacity metrics with a warning naming `CHECK_CONCURRENCY`.
- Skip loopback targets for imported checks and add `v1_import_field_min_roles`, keeping viewer defaults and existing arguments compatible.
- Save the latest verified OIDC role-claim diagnostics for admins and log unmapped claims without tokens. Clarify Entra ID-token app-role Values, direct group membership and nested-group limits.
- Application and collection versions remain aligned at 2.4.2; offline assets and existing storage/API contracts remain compatible.

## 2.4.0 — 2026-11-06

- Add opt-in automatic OIDC on top-level document navigation with `prompt=none`,
  safe return paths, bounded transactions, provider-failure fallback and retry/
  logout suppression. API, asset and machine clients retain existing behaviour.
- Make the configured provider the primary sign-in action, retain emergency local
  login, and show safe interactive errors in the portal.
- Refresh and back up OIDC display names, show effective role/account/sign-in
  method in the user menu and explain provider-managed roles in the admin list.
- Fixes #46: retain alternative group facets, compute visibility-safe counts with
  own namespace terms excluded, switch single selections in one click and put
  selections first. Keep Shift-OR, Alt-NOT, tabs and query-chip semantics.
- Add a local TLS/signing/PKCE OIDC provider and HTTP/browser/security/backup/facet
  regressions. Update environment/API/OpenAPI/provider/filter documentation.
- Application and Ansible collection versions remain aligned at 2.4.0.

## 2.3.0 — 2026-11-03

- Supply and pin entry favicons through an audited, idempotent write API, local
  file chooser and Ansible `entry_favicon`; preserve sanitised bytes/provenance
  in backups and across failed or successful server retries.
- Add opt-in browser-direct image display with a visible-target CSP allowlist,
  reliable letter fallback after SSR and documented Chromium/Firefox limits.
- Add client/server `image` checks against live device URLs, including timeout,
  non-image rejection and cache-bypassing browser probes.
- Prioritise foreground favicon jobs, skip orphan retries without losing backup
  bytes, and pause repeated permanent DNS/404/410 failures.
- Extend V1 imports with controller-supplied images, delegated API execution,
  managed checks, optional image checks, favicon overrides and split tag columns.
- Keep existing Ansible arguments/data compatible; public field values no longer
  mask result names, while legacy secrets and explicit `secret_value` stay protected.
- Test real trusted HTTPS with Chromium and Firefox, new HTTP/queue/backup paths,
  and Ansible check mode, diffs and unchanged repeat runs. App/collection are 2.3.0.

## 2.2.2 — 2026-11-01

- Stream favicon discovery pages through `</head>` or the first 256 KiB and use
  complete icon links in the prefix. Large inline JavaScript bundles no longer
  discard early favicon links. Ignore closing-head text in comments, attributes
  and raw-text elements, including tags split across response chunks.
- Keep image/manifest limits and timeout/redirect/TLS checks; close responses
  after the prefix and report prematurely aborted responses promptly.
- Add large-page, streaming-boundary and strict-limit regressions, and exercise
  a 700 KiB inline-only page in the offline container smoke check.
- App and collection versions remain aligned at 2.2.2; module arguments and
  database schema are unchanged.

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
