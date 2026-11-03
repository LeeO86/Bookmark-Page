# API

`GET /api/v1/openapi.json` is the OpenAPI document. `GET /api/v1/docs` lists the routes.

Authentication is a session cookie, `Authorization: Bearer <token>`, or trusted proxy headers. See `docs/configuration.md`. A cookie request that changes data must send an `Origin` whose host matches the `Host` header. Bearer tokens are not subject to that check.

Tokens have scopes `read`, `write`, and `admin`. Scope restrictions apply in addition to the owner role, including personal-view, preference and check-report writes. Global view management and issuing an admin token require admin scope. A child token cannot outlive its parent. The token is shown once. Only its hash is stored.

## Live updates

`GET /api/v1/events` is an SSE stream. The server subscribes before sending `ready`, sends `entries`/`status` invalidations and a `ping` every 15 seconds. Events contain only their type; clients fetch their current filtered, permission-checked view through the API. There is no event replay or polling fallback.

The portal reloads entries and tags on a successful connection after an error, and on subsequent `ready` handshakes, to reconcile changes missed while disconnected. A healthy first handshake retains the SSR snapshot without extra bootstrap requests. Query/filter and open editor state are retained; normal sign-in already reloads the catalogue. The reconnect correction is available since `v2.1.1`.

## Examples

List entries:

```sh
curl -s -H "Authorization: Bearer $BOOKMARKS_API_TOKEN" \
  "https://bookmarks.example.com/api/v1/entries?q=type:audio"
```

Entry write/patch/sync payloads also accept nullable `faviconUrl`: an HTTP(S) image URL, a path relative to the primary HTTP(S) link, or a template using only `{{host}}`. Set it to `null` or an empty string for automatic discovery. A selected `iconRef` takes priority. Direct image overrides are fetched server-side and cached by resolved URL. Credentials and non-HTTP(S) schemes are rejected. The property is returned with entries and participates in managed field ownership, history and backup/restore. Available since `v2.1.0`.

Create or update one managed entry:

```sh
curl -s -X PUT -H "Authorization: Bearer $BOOKMARKS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"externalKey":"mixer-1","name":"Mixer","host":"10.0.0.8"}' \
  https://bookmarks.example.com/api/v1/scopes/studio/entries/mixer-1
```

Sync a scope. `dryRun: true` previews the change and does not write:

```sh
curl -s -X POST -H "Authorization: Bearer $BOOKMARKS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entries":[],"purge":false,"dryRun":true}' \
  https://bookmarks.example.com/api/v1/scopes/studio/sync
```

Download a backup as an admin. Secret values are included only when `includeSecrets` is true, and then they are encrypted with the passphrase:

```sh
curl -s -X POST -H "Authorization: Bearer $BOOKMARKS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"includeSecrets":false}' \
  https://bookmarks.example.com/api/v1/backup
```

The response JSON contains `filename` and base64 `archive`. Restore with `POST /api/v1/restore` and `{ "mode": "merge", "dryRun": true, "archive": "<base64>" }`. `mode` is `merge` or `replace`.

Import CSV with `POST /api/v1/import/csv/preview` and `POST /api/v1/import/csv`. The admin page is the mapping dialog for that API.

Anonymous callers only receive entries that match a public global filter, or every entry when the All tab is public. Secret fields above the caller’s role are omitted. A secret that is visible is still masked in list and detail payloads (`value` is null and `masked` is true). `POST /api/v1/entries/{id}/fields/{key}/reveal` returns the plaintext and writes an audit row.

Filters accept `viewMode` of `list`, `cards`, or `tiles`. A new filter defaults to `cards`. Older rows and backup documents may still say `list` or `tiles`. `GET /api/v1/filters` includes `count` for each filter and `allCount` for the visible total. Those counts ignore the live search box.

`PATCH /api/v1/tags/{id}` with `{ "displayLabel": "Control A" }` sets the name shown in headings and badges. `null` clears it. The query token stays `namespace:value`. A missing display label falls back to the value. Entry tag lists still accept strings. An item may also be `{ "tag": "room:control-a", "label": "Control A" }`.

The logo accepts PNG, JPEG, WebP, or a sanitised SVG, up to 1 MB. The browser-tab icon stays PNG or WebP at 512 KB.

Signed-in preferences also store `sidebarCollapsed` and per-tab `groupModes`.

`GET /api/v1/preferences` and `PATCH /api/v1/preferences` store a signed-in user's `colourMode`, per-tab `viewModes`, `facetsOpen`, and `tileSize` (`regular` or `large`). `GET /api/v1/favicon` returns the uploaded tab icon or an SVG bookmark in the accent colour. `POST` and `DELETE /api/v1/settings/favicon` manage that upload. Settings also accept `accentPreset`, `neutralPalette`, `defaultColourMode`, and `background` (`gradient`, `tint`, or `plain`).

The query language accepts `state:online`, `state:offline`, and `state:unknown` beside `is:up`, `is:down`, and `is:unknown`. `state:` matches entries that have a check. It is not a tag.

Responses include `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a locked-down `Permissions-Policy`. `/api/icons/*` keeps `Content-Security-Policy: default-src 'none'`. The page policy allows images from this origin plus `data:` images for the component icon set. Connections permit HTTP(S) destinations for browser device probes; scripts remain restricted to this origin. Scripts stay on this origin. Styles allow `'unsafe-inline'` because the component library injects them.

The OpenAPI document derives request shapes from the shared Zod validators and documents path/query parameters, response envelopes, errors and session/Bearer authentication. Cookie writes also require a matching Origin header.

`POST /api/v1/entries/{id}/links/{linkId}/reveal` explicitly resolves a secret-backed link for a signed-in reader whose role can view every referenced field. The response is `{ "url": "..." }` with `Cache-Control: no-store`. The audit records only the link id. Normal entry responses keep the URL unresolved and expose `requiresReveal: true` for an available secret-link control. Reveal then click the resulting real anchor, preserving native browser modifiers.

Entry history uses current field permissions and omits deleted definitions and fields now classified as secrets. Saving an entry preserves fields and actions above the caller's role and rejects attempts to overwrite them. The drawer preserves the full stored HTTP request, including headers, body, expectations, icon, TLS and timeout.

Backups include user preferences. Format-1 archives from older versions still restore; missing preferences use their defaults. Both merge and replace restore preferences by the corresponding user.

## Automation and favicon APIs (2.2.1)

`ADMIN_API_TOKEN` configures an admin token without an interactive login; see
[configuration](configuration.md#persistent-automation-authentication). Existing
normal tokens may also omit `expiresAt` for no expiry. Username/password clients
use the existing session login and matching Origin headers on subsequent writes.

Uploaded entry/link `iconRef` accepts `upload-name:<exact-name>`. The server
resolves it to the stable `upload:<id>` reference before storing/comparing it.
Unknown names fail validation; there is no fuzzy selection. Existing references
remain supported. `GET /api/v1/icons?name=<exact-name>` returns only matching uploads,
with `id`, `ref`, `mediaType`, `contentHash` (SHA-256 of sanitised stored bytes), and
versioned `url`. Normal `q` searches retain their existing library/upload behavior.

`PUT` and `PATCH /api/v1/icons/{id}` replace an uploaded icon's data in place.
Body: `{ "contentType": "image/svg+xml", "data": "<standard Base64>", "name": "optional-name" }`.
Upload limits, sanitising, unique-name checks and admin permissions apply.
References/IDs remain stable, the URL content version changes, and SSE invalidates
entry views. `POST /api/v1/icons/preview` accepts the normal icon upload body
(including `name`) and returns `contentHash`, `mediaType`, and `byteSize` without
storing an icon or writing an audit record.

`POST /api/v1/settings/logo/preview` and `/api/v1/settings/favicon/preview` validate
the corresponding upload payload and return `contentHash`, `contentType`, and
`byteSize` without changing settings. Admin settings responses additionally expose
`logoHash` and `tabFaviconHash` (null when absent). Preview endpoints require admin
permission and the usual CSRF protection. Authenticated calls may update token
usage timestamps. Hashes represent canonical sanitised data, not raw SVG input.

`POST /api/v1/scopes/{scope}/filters/sync` accepts:

```json
{
  "filters": [
    {
      "externalKey": "production",
      "name": "Production",
      "query": "production:*",
      "icon": "lucide:camera",
      "groupBy": "production",
      "sort": 10,
      "viewMode": "cards",
      "columns": ["name", "host"],
      "isPublic": true
    }
  ],
  "purge": true,
  "dryRun": false
}
```

It returns `created`, `updated`, `deleted`, and `unchanged` arrays of external keys.
Only admins may synchronise global tabs. Ownership is explicit (`scope`,
`externalKey` in filter responses); personal/manual tabs and other scopes are
preserved even when names coincide. Duplicate keys fail atomically. Dry runs roll
all resource/audit changes back. Omitted `isPublic` preserves existing visibility;
new shared tabs use `sharedTabsPublicByDefault` (default false). That setting is a
new optional key in `PATCH /api/v1/settings`; explicit visibility always wins.

`entries_sync` accepts string tags and `{ "tag": "production:demo", "label": "Demo" }`
like single-entry writes. Labels are global. Omission preserves the label;
explicit null clears it. Conflicting explicit labels for the same tag in one bulk
request return 400 before any mutation. Across separate requests the latest
explicit label applies globally.

`faviconUrl` also accepts supported percent-encoded/Base64 `data:image/...` URIs.
Discovery decodes inline data locally, validates/sanitises it and stores/serves it
through the normal cache. Fallbacks and retry backoff are described in
[configuration](configuration.md#favicon-discovery-and-retries). An editor/admin
entry response includes `faviconStatus` with `status`, `error`, `fetchedAt`, and
`failureCount`; viewers/anonymous callers receive no discovery diagnostics.

`GET /api/v1/favicons` returns `{ "failures": [...] }` with entry IDs/names and
failure metadata, for admins only. `POST /api/v1/favicons/refresh-missing` queues
missing/failed entry favicons and returns `{ "queued": <entry-count> }`.
Existing `POST /api/v1/entries/{id}/favicon` remains available to editors.
Both manual refresh actions bypass the retry delay while respecting fetch-disable
configuration and deduplicating/bounding concurrent jobs.

Format-1 backups now preserve managed-token identity, tab scope/external keys, and
favicon failure counts. Older archives still restore with safe empty/default
values for the additional fields.

## Supplied entry favicons and image checks (2.3.0)

Editors/admins with write access, including write-scoped tokens, can use:

- `PUT /api/v1/entries/{id}/favicon` with `{ "contentType": "image/svg+xml",
"data": "<standard Base64>" }`. Accepts ICO, PNG, SVG, WebP, JPEG and GIF,
  using fetcher validation, SVG sanitising and `FAVICON_MAX_BYTES`. Returns
  `{changed, contentHash, mediaType, source: "supplied"}`. Repeating the same
  sanitised bytes and supplied source is unchanged.
- `POST /api/v1/entries/{id}/favicon/preview`, same payload, returns
  `{contentHash, mediaType, currentHash, currentSource}` without writing.
- `DELETE /api/v1/entries/{id}/favicon` returns `{changed}`; removes only a
  supplied image and queues discovery. Existing POST still forces a server retry.

The entry must be visible and have a resolved explicit favicon URL or a public
HTTP(S) primary link. No `iconRef` is changed. Cache slots and pinning follow
[configuration](configuration.md#devices-reachable-only-from-users-or-automation-hosts-230).
Supply/removal are audited and emit an `entries` SSE event. Non-editors cannot
supply/preview/remove. Editor diagnostics extend `faviconStatus` with `source`
(`fetched`/`supplied`), nullable `suppliedBy`/`suppliedAt`, and `retryPaused`.
Diagnostics remain omitted for viewers and anonymous visitors. Backups preserve
bytes/provenance; older format-1 archives receive safe defaults.

Admin `PATCH /api/v1/settings` accepts `browserFavicons` (default false). Entry
responses include nullable `browserIconUrl`, derived only for a visible entry
with fallback enabled and no selected/cached image. It is a display target, not
cached bytes or an online-state assertion.

Check definitions accept `kind: "image"` with either executor. An omitted
`requestSpec` uses the live favicon URL; optional `requestSpec.urlTemplate`
overrides it (GET only, `{{host}}` allowed, field placeholders withheld). Client
leases carry this live image target, never its supplied/cache URL. An unresolved,
secret-backed or data-only default target stays unknown. The server fetches and
validates the image; the browser uses `Image` load/error/timeout. See
[checks](checks-and-actions.md#image-checks) for false-down cases and browser limits.
