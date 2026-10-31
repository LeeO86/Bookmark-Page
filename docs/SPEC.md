# Bookmark-Page V2 – Specification

This document is the single source of truth for the V2 rewrite of `LeeO86/Bookmark-Page`.
Read it fully before starting a milestone. If something is ambiguous or seems wrong, ask
before deviating, and record every decision in `docs/DECISIONS.md`.

## 1. Context

V1 (2018–2020, PHP 7.4 + jQuery + MySQL, three containers) is a bookmark page used in
broadcast engineering labs to reach the web UIs of many devices. It is being replaced by a
complete rewrite. V1 has known problems that V2 must not repeat: SQL built by string
concatenation (injection, quotes break saving), no authentication, hard-coded DB credentials,
a DB "update" prompt that wiped the database, writing files into the web root.

V2 turns the page into a small **device portal**: entries (devices/services) with multiple
links, namespaced tags, a boolean query language, saved filters shown as tabs, role-based
access including SSO, online checks, HTTP actions, and full automation via an Ansible
collection.

### V1 features that must survive (in modernised form)

- Free-text search with one-click clear; filter state must survive live updates (V1 #17).
- Sorting by column, collapsible groups, collapse/expand all (V1 #28).
- Freely labelled extra columns that can be hidden from view but remain searchable
  (V1 user1–user8, #3, #19) → generalised as **custom fields** (§4.5).
- Remarks/description on entries.
- Online indication (V1 used "favicon failed to load" as an offline hint, #8) → proper checks (§7).
- Icon library as alternative to favicons; letter avatar when nothing is available.
- Per-instance title, claim, accent colour/theme and coloured browser-tab favicon so
  several instances can be told apart (#22).
- Open in new tab by default, new window via modifier key (#21) → use real `<a>` elements
  so native browser behaviour (Ctrl/Cmd/middle click) works. On the primary launcher,
  Shift enables text selection without navigation and Alt-click requests a separate window.
- Duplicate name/host warning on save (#20).
- Sticky table header (#18), custom logo in header (#29), readable footer in all themes (#27).

## 2. Tech stack

Use current stable versions at implementation time; verify against official docs instead of
relying on memory. Justify any substitution in `docs/DECISIONS.md`.

- **Nuxt 4** (Vue 3, TypeScript strict) – frontend and Nitro server API in one Node process.
- **Nuxt UI** (Tailwind-based) for components. Dark/light mode plus configurable accent colour.
- **SQLite** via **Drizzle ORM** (`better-sqlite3` driver), WAL mode, versioned migrations
  applied automatically on start. Never drop or recreate tables outside a migration.
- **Zod** for validation of every API input, shared schemas between client and server.
- **Auth:** sealed cookie sessions (e.g. `nuxt-auth-utils`), generic OIDC via `openid-client`
  (discovery, PKCE), password hashing with argon2 (`@node-rs/argon2`).
- **Live updates:** Server-Sent Events. No Socket.IO, no page reloads.
- **Tests:** Vitest (unit + API integration), Playwright (e2e smoke).
- **Ansible collection:** Python, stdlib + `ansible.module_utils.urls.open_url` only
  (no `requests` dependency), `ansible-test sanity` clean.
- **Container:** single image, non-root, multi-arch (amd64, arm64), data in `/data`.
- **Offline UI assets:** bundle UI icons and fonts locally. With dependencies installed,
  compilation works without internet; the running UI serves assets from its own origin,
  including dynamically selected Lucide icons, with no public icon/font API fallback.

## 3. Repository layout and branches

```
/                     # main = V2
├── app/              # Nuxt application
├── ansible_collections/leeo86/bookmarks/
├── docs/             # SPEC.md, DECISIONS.md, user/admin docs
├── docker/           # Dockerfile, compose examples
├── .github/workflows/
├── AGENTS.md
└── README.md
```

- V2 is released from **`main`**, the default branch. Preserve the legacy `v1` and
  `master` branches. The user authorized the V2 main-branch merge and v2.0.0 release
  on 2026-10-29; this supersedes the earlier temporary separate-branch restriction.
- README states clearly: V1 is on branch `v1` (legacy image `adihilber/bookmark-page`),
  V2 images are published to GHCR.

## 4. Domain model

All IDs are ULIDs or UUIDv7. Every table has `created_at`, `updated_at`; mutable domain
objects also `created_by`, `updated_by`.

### 4.1 Entry
`name` (required), `description`, `host` (hostname or IP, optional), `icon_ref` (see §6),
`favicon_url` (optional explicit image URL/path, see §6),
`sort` (manual order), `source` (`null` = created in UI, otherwise `ansible:<scope>`),
`external_key` (unique per source, required when source is set), `managed_fields`
(JSON list of attribute paths owned by the automation source, see §9.3).

### 4.2 Link (belongs to an entry, ordered)
`label`, `url_template`, `type` (`web` | `api` | `ssh` | `vnc` | `rdp` | `telnet` | `other`),
`is_primary` (exactly one per entry if any links exist), `sort`, optional `icon_ref`.

- `url_template` supports placeholders (§8.2), most importantly `{{host}}`, e.g.
  `https://{{host}}:8443/admin`. Changing the entry's host updates all links.
- The tile, the card, or the list entry cell opens the primary link. Other links are
  their own buttons. Reachability is shown on the favicon, not in a status column.
- Non-HTTP schemes are rendered as links (browser protocol handler) **and** offer a
  copy button as fallback.

### 4.3 Tags
Tags are `namespace:value` (e.g. `type:audio`, `room:studio3`, `vendor:lawo`) or plain
`value` without namespace. Many-to-many with entries. A tag may also store
`display_label`, shown in headings, facets, and badges. The query token stays
`namespace:value`.

**Tag namespaces** are admin-managed: `name`, `label`, `colour`, `sort`,
`show_in_sidebar`. Unknown namespaces used via API/Ansible are auto-created with defaults.

### 4.4 Filters (tabs)
`name`, `query` (§5), `owner_user_id` (`null` = global, set by admin), `columns`
(which custom fields to show and in which order), `group_by` (optional tag namespace),
`sort`, `icon`, `view_mode` (`list` | `cards` | `tiles`; new filters default to
`cards`, and the column default stays `list` so existing rows are unchanged), `public`
(global filters only: visible to anonymous users).

- Global filters appear first as tabs for everybody who may see them, personal filters
  after them for their owner.
- There is a built-in **All** tab. Admin setting decides whether it is visible to anonymous users.
- Users can save the current query as a personal tab, rename, reorder and delete their tabs.

### 4.5 Custom fields
Admin defines field definitions: `key`, `label`, `type` (`text` | `url` | `number` | `secret`),
`min_role_to_view` (`anonymous` | `viewer` | `editor` | `admin`), `searchable`,
`show_as_column_default`, `sort`. Values are stored per entry.

- `secret` fields are encrypted at rest (AES-256-GCM, key from `BOOKMARK_SECRET_KEY`),
  never searchable, masked in the UI with *reveal* (audited) and *copy* buttons.
- Fields above the caller's role are **stripped server-side** from every response (§10).

### 4.6 Other tables
`users`, `api_tokens`, `icons`, `favicon_cache`, `checks`, `check_status`, `actions`,
`action_templates`, `audit_log`, `settings`, `ansible_scopes`. Details in the sections below.

## 5. Query language

One grammar, implemented once in TypeScript and shared by client (live validation,
chips, autocomplete) and server (translation to parameterised SQL). Never build SQL by
string concatenation.

```
query    := or
or       := and ( "OR" and )*
and      := unary ( ["AND"] unary )*        # implicit AND between terms
unary    := ("NOT" | "-") unary | primary
primary  := "(" or ")" | term
term     := ns ":" value                    # namespaced tag, value may end with *
          | "#" value                       # tag without namespace
          | "is:" ("up"|"down"|"unknown"|"managed"|"unmanaged")
          | "state:" ("online"|"offline"|"unknown")
          | "has:" (link|field_key|check)
          | word | "quoted text"           # free text
```

- Operators are case-insensitive (`and`/`AND`). `ns:*` means "has any tag in namespace".
- `state:online`, `state:offline`, and `state:unknown` are a virtual status, not stored
  tags. They match only entries that have a check. `is:unknown` still also matches an
  entry that has no checks.
- Free text matches name, description, host, link labels and URLs, and values of
  searchable non-secret fields the caller may view.
- Example: `type:audio (room:studio1 OR room:studio2) -status:spare lawo`.
- UI: a query bar that shows parsed terms as chips (tag chips coloured by namespace),
  with autocomplete for namespaces and values and inline syntax errors. Clicking a tag in
  the sidebar toggles it with AND, Alt/Option-click toggles it negated, Shift-click toggles it with OR.
  Repeating the same selection removes all matching occurrences, including existing duplicates.
  Changing between positive and negated selection replaces the previous selection.
- Query and active tab are reflected in the URL so views can be shared.
- Unit-test the parser and SQL translation thoroughly, including precedence and escaping.

## 6. Icons and favicons

Resolution order for an entry/link icon: manually chosen library icon → uploaded icon →
fetched favicon → letter avatar (initials, colour derived from name).

**Favicon fetching (server-side only):**

- Entry expert option `favicon_url` overrides discovery with an HTTP(S) image URL, a
  path relative to the primary HTTP(S) link, or a URL using `{{host}}`. Empty restores
  discovery. Reject credentials, other schemes and field/secret placeholders. A chosen
  library/upload icon still takes priority. Secondary links keep their own discovery.
  Persist it in API/sync, history and backups.
- Triggered asynchronously when a link is created or its URL changes, plus a manual
  "refetch" button and an optional periodic refresh (default weekly).
- Discovery: parse HTML `<link rel="icon">`, `shortcut icon`, `apple-touch-icon`, web
  manifest icons, then fall back to `/favicon.ico`. Prefer SVG, otherwise the largest raster.
- **TLS verification is disabled for favicon fetches by default** (devices commonly use
  self-signed certificates); configurable globally.
- Limits: timeout (5 s default), max size (512 KB), max 3 redirects, only http/https.
- Automatic cache keyed by origin (scheme+host+port) after template resolution; explicit
  image sources keyed by their full resolved URL so overrides on one origin stay independent.
  Persist the fetch source/mode for periodic refresh. Store bytes in DB
  or `/data/icons`; serve from `/api/icons/...` with long cache headers and an ETag.
- Record failures with a reason; failed fetches fall back to the letter avatar, never a
  broken image.

**Icon library (admin):** ships with the Lucide icon set (Lucide is the successor of the
Feather icons used in V1, so V1 icon names map directly). Admins can upload SVG/PNG/WebP
(max 256 KB). **SVGs must be sanitised server-side** (strip scripts, event handlers,
external references) before storage.

## 7. Online checks

A check belongs to an entry (default target: `host`) or to a specific link.

- `kind`: `icmp` | `tcp` (host + port) | `http` (uses the request spec of §8).
- `executor`: `server` | `client`.
- `interval` (default 60 s, global minimum configurable), `timeout`, `tls_verify` (default false).

**Server executor:** in-process scheduler with a concurrency limit. ICMP requires
`CAP_NET_RAW` in the container; detect missing capability at start-up, log it clearly and
mark ICMP checks as `unknown` with an explanatory message instead of failing silently.

**Client executor** (for networks where the browser can reach a device but the server
cannot, e.g. firewalls):
- Clients do not check everything on every page view. They request due checks via
  `POST /api/v1/checks/lease`; the server returns only checks whose status is stale and
  leases them to that client for a short period so other clients skip them.
- The browser performs a lightweight probe (image load or `fetch` with `mode: "no-cors"`
  and a timeout) and reports the result via `POST /api/v1/checks/{id}/report`.
- Document the browser limits honestly in the UI help and docs: opaque responses (no
  status code validation), mixed content (an HTTPS page cannot probe `http://` targets),
  and untrusted certificates make client probes unreliable.
- Reporting requires an authenticated user by default (admin setting may allow anonymous).

**Status:** `check_status` stores state (`up` | `down` | `unknown`), latency, message,
`checked_at`, `reported_by` (`server` or `client:<user>`). Status changes are pushed to all
clients via SSE. The entry row shows a status dot with a tooltip (last check, by whom, latency).

## 8. Actions (HTTP request engine)

### 8.1 Request spec (shared by actions and HTTP checks)
`method` (any HTTP method), `url_template`, `headers` (templated), `body_template`,
`tls_verify` (default false), `timeout`, and an **expectation**:
- `status`: list of codes or ranges (`2xx`, `200`, `204`),
- optional `body_contains`, `body_regex`,
- optional `json_path` + `equals`.

The result is green (expectation met) or red (not met / error), with status code, latency
and a truncated response body (max 4 KB shown).

### 8.2 Placeholders
Mustache-style, resolved server-side: `{{host}}`, `{{entry.name}}`, `{{field.<key>}}`
(including secret fields – resolved on the server, never sent to the client),
`{{input.<name>}}` (runtime prompts declared on the action: name, label, type, default,
required). Unknown placeholders are an error, not an empty string.

### 8.3 Actions
- An action has `name`, `icon`, request spec, `confirm` (default true for non-GET),
  `min_role` (default `editor`), and belongs to an entry.
- **Action templates** (admin): a request spec plus a **query** (§5). The action appears on
  every entry matching the query, e.g. "Reboot" for `vendor:lawo type:audio`.
- Actions are executed **server-side only** (browsers would hit CORS for device APIs).
  Rate-limit execution per user. Every execution is written to the audit log
  (secrets redacted).
- Treat this as intentional SSRF: only roles with the right permission may create or run
  actions; document it.

## 9. API and automation

### 9.1 REST API
- Versioned under `/api/v1`, JSON, Zod-validated, with a generated **OpenAPI** document
  served at `/api/v1/openapi.json` and a docs page.
- Auth: session cookie (UI) or `Authorization: Bearer <token>`.
- **API tokens** (admin-managed, also personal tokens for editors): name, scopes
  (`read`, `write`, `admin`), optional expiry, `last_used_at`. Store only a hash, show the
  token once.
- CRUD for entries (with links, tags, fields, checks, actions), tags, namespaces, filters,
  field definitions, icons, settings, users.
- **Upsert by external key:** `PUT /api/v1/scopes/{scope}/entries/{external_key}`.
- **Declarative sync:** `POST /api/v1/scopes/{scope}/sync` with the full desired list and
  `purge: true|false`. Purge only ever removes entries of that scope. Returns a diff
  (created/updated/deleted/unchanged) and supports `dry_run`.
- Writes from API tokens set `source` = `ansible:<scope>` when called via scope endpoints.

### 9.2 Ansible scopes and edit modes
Admin can configure per scope (default for new scopes is configurable):
- `locked` – managed entries are read-only in the UI.
- `field_ownership` (**default**) – the automation owns the attributes it sets (recorded in
  `managed_fields`). Those are read-only in the UI; users may add further tags, links,
  fields and description. The next sync leaves user additions untouched.
- `free` – everything editable in the UI, with a warning that the next sync overwrites
  managed attributes.

Links are matched by `label` within an entry, tags by full `namespace:value`.
Managed entries display a badge with the scope name.

### 9.3 Ansible collection `leeo86.bookmarks`
Located at `ansible_collections/leeo86/bookmarks`, installable via
`ansible-galaxy collection install "git+https://github.com/LeeO86/Bookmark-Page.git#/ansible_collections/leeo86/bookmarks,v2.0.0"`.

Common options: `api_url`, `api_token` (fallback env `BOOKMARKS_API_URL`,
`BOOKMARKS_API_TOKEN`), `validate_certs`. All modules support `check_mode` and `--diff`,
are idempotent and report `changed` correctly.

Modules:
- `entry` – one entry by `scope` + `external_key`: name, host, description, tags, links,
  fields, icon, checks, `state: present|absent`.
- `entries_sync` – full list for a scope with `purge`.
- `entry_info` – query entries (supports the query language).
- `tag_namespace`, `field_definition`, `filter` (global tabs), `action_template`.

Roles:
- `inventory_sync` – builds entries from inventory hosts of a given group: `host` from
  `ansible_host`, tags from `group_names` (configurable group→namespace mapping and
  include/exclude patterns), links from a per-host variable `bookmark_links` (list of
  label/url_template/type/primary), fields from `bookmark_fields`, optional checks.
  Runs on localhost, uses `entries_sync` with purge.
- `v1_import` – migrates a V1 instance **over HTTP**, no MySQL access required: reads
  `<v1_url>/php/getGlobal.php` and `<v1_url>/php/getBookmarks.php`. Mapping: V1 groups →
  tag `group:<name>` (group remarks lost unless mapped to the namespace label – document
  it), V1 remarks → description, V1 link → single primary link, `nameU1..8` labels →
  field definitions (`hideUx` → not shown as column), `user1..8` → field values,
  `img/icons/<name>.svg` → library icon `<name>`, other favicon URLs → favicon override,
  V1 sort order preserved. Variable `v1_import_secret_fields` lists V1 columns to import as
  `secret` fields (V1 users often stored usernames/passwords there). Imported entries get
  scope `v1-import` (configurable).
  `v1_import_tag_fields` explicitly maps selected `user1..8` columns to tag namespaces
  (empty namespace creates plain tags). Each non-empty trimmed cell becomes one tag;
  mapped columns do not become custom fields. Never infer tags from `hideUx`; reject
  overlap with secret columns. Relative V1 favicon addresses resolve against `v1_url`.

Tests: `ansible-test sanity` and integration tests against the app container in CI.

## 10. Authentication, roles, visibility

### 10.1 Auth sources (combinable, configured via env)
- **Local accounts** – username/password, argon2. A bootstrap admin is created on first
  start from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Local login can be disabled for everyone
  except designated break-glass admins.
- **OIDC** – generic provider via discovery URL (tested against Microsoft Entra ID and
  Keycloak). Role mapping from a configurable claim (default `roles`) via a JSON mapping.
  Just-in-time user provisioning.
- **Trusted header** – for SSO in front of the app (e.g. Traefik ForwardAuth +
  oauth2-proxy). Configurable user header (default `Remote-User`), optional email and
  groups headers, group→role mapping. **Headers are only accepted from configured proxy
  CIDRs**; requests from other sources ignore them. Log a warning at start if enabled
  without trusted proxies.

### 10.2 Roles
- `anonymous` – sees only what admin made public (see below), no personal tabs.
- `viewer` – sees all entries, may create personal tabs.
- `editor` – CRUD on entries (respecting edit modes), runs actions, reports client checks.
- `admin` – settings, users, field definitions, namespaces, icon library, tokens, scopes,
  action templates, audit log, backup.

### 10.3 Visibility rules (enforced on the server, for every endpoint including SSE and export)
- Anonymous users may only receive entries matching **at least one public global filter**
  (or all entries if the All tab is public). Any query an anonymous user sends is ANDed
  with that visibility constraint server-side. A crafted query must never widen access.
- Custom fields above the caller's role are removed from every payload, search, SSE event,
  export and audit-log view.
- Write integration tests that prove this for each endpoint. This is a hard requirement.

## 11. UI

Bookmark-Page is a start page. The question on the screen is where to go next. People
recognise a device by its icon and open it. Editing is rare. The page is not a dashboard:
there is no status column, latency, or metric in the portal. Check latency stays in
Prometheus and in the icon tooltip.

Desktop-first, responsive, English only. The portal is an app shell: a full-width banner,
a side nav of views and filters, and a content area. Admin keeps its own collapsible
sidebar and a navbar toggle that opens it as a drawer on a narrow screen.

- **Theme:** one accent and one neutral palette, stored in settings and applied on the
  server so the first paint matches. Named presets use the vivid Tailwind scales Red,
  Yellow (amber), Pink, Green, Cyan, Blue, and Grey (slate). A custom hex keeps its chroma
  and hue and only changes lightness. Filled controls use a step that reaches 4.5:1, not a
  desaturated seed. The background setting (`gradient`, `tint`, or `plain`) paints the
  banner only. The content area stays neutral. Warm accents suggest the stone neutral and
  cool accents suggest slate, unless the admin picks another neutral afterwards. Banner
  text meets 4.5:1 against the banner. Text on cards meets 4.5:1 against the card. Tag
  text uses black or white against the namespace colour (3:1). The status dot meets 3:1
  against the light icon plate. The admin sets the default colour mode; a signed-in user
  can override it, and an anonymous visitor keeps the choice in a cookie.
- **Browser tab:** a bookmark glyph in the accent colour, or an uploaded PNG/WebP, served
  from `/api/v1/favicon` on this origin.
- **Banner:** a bundled colourful app icon is the default title image; an uploaded logo overrides it and removing the upload restores it. Custom logos accept PNG, JPEG, WebP, or sanitised SVG up to
  1 MB. The banner also shows the site title and the claim. The right side is an initials avatar or Sign in.
  Colour mode, edit mode, Admin, and sign-out live in that menu. The banner scrolls away.
  Resolve branding, the current actor, visible views/fields/entries and saved preferences
  on the original server request. Include the correct logo and available entry icon URLs
  in the first HTML, preload the current banner image, and hydrate the same per-request
  state without refetching the initial catalogue or showing a default-logo placeholder.
  Render only data the caller may receive through the API. Personalised HTML uses
  `Cache-Control: private, no-store`; images retain their own cache policy. Browser-only
  session preferences apply after hydration. Check tooltip timestamps use their ISO UTC
  representation so server/client locales do not cause hydration mismatches.
- **Sidebar:** views (the saved tabs) with a count, then filter facets. It is about 240px,
  collapses to icons, and becomes a drawer below 768px. "+ Save as view" is quiet and only
  for a signed-in user. Facets show a namespace colour and the tag display label. Click
  toggles AND, Shift toggles OR, and Alt toggles NOT. Selected facets remain available
  at zero matches so they can be removed. `state` is a virtual facet and is not stored
  as a tag. "Clear filters" clears the query bar.
- **Toolbar:** sticky query bar with `⌘K` and `/`, a segmented control for cards, tiles,
  and list, and a group menu. The command palette is that same search surface.
- **Status:** only the favicon changes. Up is unchanged. Down is greyscale and dimmed,
  with a small red corner dot. Unknown keeps the colour and adds a small amber dot. No
  check shows nothing. The icon tooltip may say when a device went offline.
- **Editing:** normal mode is the default for every role. Clicks open links, and `e` does
  nothing. Right-click, a long press, or the hover menu offers Copy link, Open all links,
  and history to everyone, and Edit to an editor. Edit mode is for editors and admins,
  from the user menu or Shift+E, and it lasts for the browser tab only. It shows a banner,
  edit buttons, New entry, Add link, and drag-sort. `e` opens the selected entry only then.
- **Views:** cards are the default, including All. A tab can store another default, and
  the `view` query parameter still wins. Cards use a 260px minimum: favicon, a two-line
  title, host, description, only fields that have a value, labelled secondary links, and
  up to three tags. Tiles are the compact launcher, 48px or 56px icon. The list is a dense
  table, 36px rows or 32px in compact density, and it stays a list on a narrow screen.
  Only a sorted column shows an arrow. Grouping is a heading with the tag display label,
  a count, and a collapse control. A missing icon is a letter in a colour derived from the
  name. Tags are subtle badges with a namespace dot; the tooltip is the query token.
  A tag may store `display_label`. Empty means the value is shown. The query token does
  not change.
- **Opening an entry:** the whole tile or card is one primary link (`target="_blank"`,
  `rel="noopener noreferrer"`). Secondary links, secret reveal, and menus are real
  controls above that link. In the list, the entry cell is the primary link. Enter still
  opens it. `ssh`, `vnc`, `rdp`, `telnet`, and `other` also have a copy button.
  Shift held over a card/tile temporarily disables its launcher overlay, allowing text
  selection and copying without opening the link. Alt-click on the primary link requests
  a new window; Ctrl/Cmd and middle-click retain native link behavior. Explicit secondary
  links, menus, drag handles, and secret controls remain independent.
  Secret-backed links stay unresolved until reveal.
- **Keyboard:** `/` focuses the query bar, `Esc` clears it, arrow keys move the selection
  in visual order, `Enter` opens the primary link, Shift+E toggles edit mode, `e` edits
  the selection only while edit mode is on, and Ctrl/Cmd+K opens the command palette.
- **Feedback:** toasts for saves, action results, and errors; skeletons that follow the
  active view; empty states for no entries, no matches, and no access.
- **Entry editor** (drawer): name, host, description, tags with autocomplete, link list
  with drag-sort and primary toggle, fields, icon picker (library / upload / fetched /
  letter, with refetch), expert favicon URL/path, checks, actions. Duplicate name/host warning. Managed attributes
  shown read-only with explanation.
- **History:** per entry change history with diffs from the audit log and "restore this
  version" (addresses V1 #12 undo). Anyone can open it from the entry menu. Restore stays
  behind edit permission.
- **Admin area:** one page per section (settings and theme, users, auth status, fields,
  namespaces, tokens, scopes, icons, action templates, backup, CSV import, audit log).
  Settings include the page background. Check intervals stay on each check. There is no
  separate check-defaults page.
  All file selectors and actions use visible, keyboard-accessible buttons; file selectors
  show the selected filename. Library icon uploads have an explicit submit button.
  Destructive actions (delete, remove custom branding, restore/replace data) use red
  semantic error styling, independent of the accent/theme. Restore previews stay neutral
  or primary because they do not write data. An X in the top-right navbar of every admin
  section returns to the portal on desktop and mobile; it is a navigation control, not
  a destructive action.
- Live updates via SSE for entries and status; never lose query, scroll position or open
  editor state on update.

## 12. Import / export / history

- **Backup** (admin): zip with JSON of all data plus icons. Secrets are exported only if
  explicitly requested, re-encrypted with a passphrase entered at export time.
- **Restore**: replace or merge, with a dry-run preview.
- **CSV import** of entries with a column-mapping dialog (name, host, description, primary
  link, tags, fields).
- **Audit log**: actor, actor type (user/token/system), action, target, diff with secrets
  redacted, timestamp. Retention configurable.

## 13. Operations

- Single container, non-root, `/data` volume (SQLite DB + icons). Port 3000.
- Configuration via env vars, documented in `.env.example`. **Refuse to start** without
  `BOOKMARK_SECRET_KEY`.
- `GET /api/health` (liveness + DB check) and `GET /metrics` (Prometheus: entries, check
  states per entry, check latency, action executions), metrics optionally protected by token.
- Security: secure/HttpOnly/SameSite cookies, CSRF protection (origin check) for cookie
  sessions, login rate limiting, strict CSP, no secrets in logs, security headers.
- Example `docker-compose.yml` (plain) and one with Traefik labels.
- GitHub Actions: lint, typecheck, unit/integration/e2e tests, `ansible-test sanity`,
  multi-arch image build pushed to GHCR (`ghcr.io/leeo86/bookmark-page`) with tags
  `2.x.y`, `2.x`, `2`, `latest` on release tags.

## 14. Documentation (in `docs/`, English)

`installation.md`, `configuration.md` (all env vars), `query-language.md`, `ansible.md`
(collection, roles, inventory example, sync semantics, edit modes), `migration-v1.md`,
`api.md` (pointer to OpenAPI plus examples), `auth-entra.md` (app registration, redirect
URI, **use App Roles instead of group claims to avoid the group overage limit**, role
mapping), `auth-keycloak.md` (client setup, role mapper, **LDAP/AD via User Federation**),
`auth-header-proxy.md` (Traefik ForwardAuth + oauth2-proxy example, trusted proxies),
`checks-and-actions.md` (including browser limits of client checks and the SSRF note),
`DECISIONS.md`.

## 15. Milestones

Work strictly milestone by milestone. At the end of each: all tests green, app runs in the
container, docs updated, a short report (what was built, deviations, open questions).
Stop and wait for review before starting the next milestone.

**M0 – Foundation:** `v1` branch, remove V1 files from the V2 branch, Nuxt scaffold, lint/format,
Drizzle setup with first migration, Dockerfile, compose example, CI skeleton, health endpoint.

**M1 – Core backend:** full data model and migrations, auth (local, OIDC, trusted header),
roles, sessions, API tokens, REST API with OpenAPI, query language parser + SQL
translation, visibility enforcement, secret encryption, audit log, scope upsert/sync with
edit modes. Exhaustive tests for parser and visibility.

**M2 – UI:** main view, query bar with chips and autocomplete, tabs (global/personal/All),
sidebar facets, grouping, entry editor, history view, admin settings/users/fields/
namespaces/tokens/scopes, theming and logo, SSE live updates, keyboard navigation.

**M3 – Icons and checks:** favicon discovery and cache, icon library with Lucide and
sanitised uploads, server and client check executors with leasing, status display,
Prometheus metrics.

**M4 – Actions:** request spec, expectations, placeholders and runtime inputs, entry
actions, action templates bound to queries, execution UI with result display, rate
limiting, audit.

**M5 – Ansible:** collection with all modules, `inventory_sync` and `v1_import` roles,
example playbooks and inventory, sanity and integration tests in CI.

**M6 – Data and polish:** backup/restore, CSV import, remaining docs, accessibility pass,
e2e smoke tests, release workflow.
