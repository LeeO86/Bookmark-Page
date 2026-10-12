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

Anonymous callers only receive entries that match a public global filter, or every entry when the All tab is public. Secret fields above the caller’s role are omitted.
