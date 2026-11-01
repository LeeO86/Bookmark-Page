# Configuration

The server reads these variables from the environment. A blank value is treated as unset. Ansible clients use `BOOKMARKS_API_URL` and `BOOKMARKS_API_TOKEN`, which the server does not read.

| Variable                      | Default                                                                  | Purpose                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `BOOKMARK_SECRET_KEY`         | required                                                                 | Standard Base64 that decodes to 32 bytes. Seals session cookies and encrypts secret fields.              |
| `DATABASE_PATH`               | `/data/bookmark.db` in the image, `./data/bookmark.db` in `.env.example` | SQLite file. The parent directory is created.                                                            |
| `MIGRATIONS_FOLDER`           | `drizzle` under the working directory, `/app/drizzle` in the image       | Drizzle migration directory.                                                                             |
| `ADMIN_USERNAME`              | unset                                                                    | Bootstrap admin username. Used only when both this and the password are set and the user does not exist. |
| `ADMIN_PASSWORD`              | unset                                                                    | Bootstrap admin password. At least 8 characters. The account is break-glass.                             |
| `LOCAL_LOGIN_ENABLED`         | `true`                                                                   | When `false`, only break-glass users can use password login.                                             |
| `SESSION_COOKIE_SECURE`       | `false`                                                                  | Set `true` behind HTTPS so the session cookie is marked Secure.                                          |
| `OIDC_DISCOVERY_URL`          | unset                                                                    | OIDC discovery URL. All four OIDC values are required to enable it.                                      |
| `OIDC_CLIENT_ID`              | unset                                                                    | OIDC client id.                                                                                          |
| `OIDC_CLIENT_SECRET`          | unset                                                                    | OIDC client secret.                                                                                      |
| `OIDC_REDIRECT_URI`           | unset                                                                    | OIDC redirect URI, for example `https://bookmarks.example.com/api/v1/auth/oidc/callback`.                |
| `OIDC_ROLE_CLAIM`             | `roles`                                                                  | Claim that contains role values.                                                                         |
| `OIDC_ROLE_MAPPING`           | `{}`                                                                     | JSON object of claim value to `viewer`, `editor`, or `admin`. Unmapped users become viewers.             |
| `AUTH_TRUSTED_HEADER_ENABLED` | `false`                                                                  | Accept identity headers from a reverse proxy.                                                            |
| `AUTH_TRUSTED_PROXIES`        | empty                                                                    | Comma-separated CIDRs. Headers from any other peer are ignored.                                          |
| `AUTH_USER_HEADER`            | `Remote-User`                                                            | Username header.                                                                                         |
| `AUTH_EMAIL_HEADER`           | unset                                                                    | Optional email header.                                                                                   |
| `AUTH_GROUPS_HEADER`          | unset                                                                    | Optional groups header.                                                                                  |
| `AUTH_GROUP_ROLE_MAPPING`     | `{}`                                                                     | JSON object of group name to `viewer`, `editor`, or `admin`.                                             |
| `AUDIT_RETENTION_DAYS`        | `365`                                                                    | Delete audit rows older than this many days on startup. `0` keeps them.                                  |
| `METRICS_TOKEN`               | empty                                                                    | Bearer token required by `GET /metrics`. Empty leaves metrics open.                                      |
| `CHECK_MIN_INTERVAL_SECONDS`  | `15`                                                                     | Fastest interval for a server or browser check.                                                          |
| `CHECK_CONCURRENCY`           | `4`                                                                      | How many server checks may run at once.                                                                  |
| `ACTION_RATE_LIMIT`           | `30`                                                                     | Action executions allowed per user in the rate window.                                                   |
| `ACTION_RATE_WINDOW_MS`       | `900000`                                                                 | Rate window in milliseconds.                                                                             |
| `FAVICON_TIMEOUT_MS`          | `5000`                                                                   | Favicon fetch timeout.                                                                                   |
| `FAVICON_MAX_BYTES`           | `524288`                                                                 | Largest favicon that is stored.                                                                          |
| `BOOKMARK_FAVICON_FETCH`      | enabled                                                                  | Set `0` to skip automatic favicon fetches.                                                               |
| `BOOKMARK_MONITORS`           | enabled                                                                  | Set `0` to skip the server check scheduler.                                                              |
| `LUCIDE_ICONS_DIR`            | the installed `lucide-static` icons directory                            | Override the Lucide SVG directory.                                                                       |

`pnpm seed:demo` writes a local studio catalogue. It uses `DATABASE_PATH` when that variable is set, and otherwise `data/bookmark-demo.db`. Running it again replaces the previous demo entries and tabs.

Favicon TLS verification, the favicon refresh period, the site title, the claim, and whether the All tab is public are admin settings stored in the database, not environment variables. The same settings hold the accent preset, custom accent hex, neutral palette (`slate`, `gray`, `zinc`, `neutral`, `stone`), the default colour mode (`system`, `light`, or `dark`), and the page background (`gradient`, `tint`, or `plain`, painted on the banner). The logo may be PNG, JPEG, WebP, or a sanitised SVG, up to 1 MB. A signed-in user can override the colour mode, the view mode of each tab, whether the filter panel is open, and the tile size (`regular` or `large`). Anonymous visitors keep colour mode and view mode in the `bp-color-mode` and `bp-theme` cookies, and the filter panel in `bp-facets`. Edit mode is kept in `sessionStorage` for the browser tab and is not a server preference. The browser-tab icon is the accent bookmark glyph, or a PNG/WebP uploaded next to the logo.

## Persistent automation authentication

`ADMIN_API_TOKEN` optionally supplies an admin-scoped token named `bootstrap`,
without expiry. Generate a new secret with 32 random bytes:

```sh
node -e "console.log('bp_' + require('crypto').randomBytes(32).toString('base64url'))"
```

The value must have a `bp_` prefix and at least 43 Base64url characters. Set
`ADMIN_API_TOKEN_FILE` instead to read it from a mounted secret file; do not set
both. Only its hash is stored. On **every startup**, unchanged configuration is a
no-op, a changed value invalidates the previous managed secret, and an unset
value removes that managed token. User-created tokens, even those also named
`bootstrap`, remain untouched. `ADMIN_USERNAME` selects an existing admin owner;
without it, a break-glass admin is selected. Startup fails if no suitable admin
exists. User role restrictions continue to apply. Existing databases/accounts
are supported; token reconciliation does not depend on first-time user creation.

Ansible can instead use `BOOKMARKS_USERNAME`/`BOOKMARKS_PASSWORD` for a local
session. See [Ansible connection options](ansible.md#automation-additions-in-221).

## Shared-tab visibility

The database setting `shared_tabs_public_by_default` (API:
`sharedTabsPublicByDefault`) defaults to **false**. When enabled it affects only
new global/shared tabs whose visibility was omitted. It never publishes personal
or existing private tabs. Explicit private visibility wins. `all_tab_public`
remains independent; enabling All does not automatically change this default.

## Favicon discovery and retries

Inline `data:image/...` favicons support SVG, PNG, WebP and ICO
(`image/x-icon`/`image/vnd.microsoft.icon`), percent encoding and standard Base64.
The URI's media type determines how it is handled, regardless of HTML `type` or
file extension. Decode locally, validate bytes, enforce `FAVICON_MAX_BYTES` and
apply the same SVG sanitiser as uploaded icons. External SVG references, scripts
and event handlers remain forbidden or removed; DTD declarations remain rejected.
Inline data is also accepted in the expert entry override.

Discovery tries ordinary SVG icons first, then raster icons from largest to
smallest. Safari mask icons have lower priority than normal icons. Failed linked
candidates are followed by manifest candidates and finally `/favicon.ico`.
HTML responses disguised as images are rejected. At most 32 candidates per list
are attempted; requests retain the configured timeout/size/redirect/TLS limits.
Four discovery jobs may run concurrently.

Successful fetches retain `favicon_refresh_days` (default 7). Failures retry after
5 minutes, 1 hour, then every 6 hours until successful; retry count and attempt
time survive restarts. A separate minute scheduler checks due work, even with
`BOOKMARK_MONITORS=0`; `BOOKMARK_FAVICON_FETCH=0` disables fetching and its scheduler.
Refresh preserves the last good bytes while exposing the latest error. Images
use content-versioned URLs and ETags. Completion invalidates open clients through
SSE. Editors see failures in the entry drawer; admins see them in the icon library
and can choose **Refresh missing favicons**. Manual refresh bypasses backoff and
uses the same bounded queue.

Automatic favicon work never resolves links containing secret-field placeholders.
Those links remain behind explicit reveal. Configure a separate public favicon
override if such an entry needs an image. Secret values cannot enter stored retry
sources through background link resolution.
