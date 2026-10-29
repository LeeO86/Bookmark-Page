# API

`GET /api/v1/openapi.json` is the OpenAPI document. `GET /api/v1/docs` lists the routes.

Authentication is a session cookie, `Authorization: Bearer <token>`, or trusted proxy headers. See `docs/configuration.md`. A cookie request that changes data must send an `Origin` whose host matches the `Host` header. Bearer tokens are not subject to that check.

Tokens have scopes `read`, `write`, and `admin`. Scope restrictions apply in addition to the owner role, including personal-view, preference and check-report writes. Global view management and issuing an admin token require admin scope. A child token cannot outlive its parent. The token is shown once. Only its hash is stored.

## Examples

List entries:

```sh
curl -s -H "Authorization: Bearer $BOOKMARKS_API_TOKEN" \
  "https://bookmarks.example.com/api/v1/entries?q=type:audio"
```

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
