# API

`GET /api/v1/openapi.json` is the OpenAPI document. `GET /api/v1/docs` lists the routes.

Authentication is a session cookie, `Authorization: Bearer <token>`, or trusted proxy headers. See `docs/configuration.md`. A cookie request that changes data must send an `Origin` whose host matches the `Host` header. Bearer tokens are not subject to that check.

Tokens have scopes `read`, `write`, and `admin`. The token is shown once. Only its hash is stored.

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

Filters accept `viewMode` of `list`, `cards`, or `tiles`. It defaults to `list`.

`GET /api/v1/preferences` and `PATCH /api/v1/preferences` store a signed-in user's `colourMode` and per-tab `viewModes`. `GET /api/v1/favicon` returns the uploaded tab icon or an SVG bookmark in the accent colour. `POST` and `DELETE /api/v1/settings/favicon` manage that upload. Settings also accept `accentPreset`, `neutralPalette`, and `defaultColourMode`.

Responses include `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a locked-down `Permissions-Policy`. `/api/icons/*` keeps `Content-Security-Policy: default-src 'none'`. The page policy allows images, scripts, and connections from this origin only. Styles allow `'unsafe-inline'` because the component library injects them.
