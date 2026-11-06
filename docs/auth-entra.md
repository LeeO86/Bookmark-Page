# Microsoft Entra ID

Use an App Registration and App Roles. Do not use the `groups` claim for authorization. Large tenants hit the group overage limit, and the token then omits the groups the mapping needs.

## App registration

1. In Entra ID, create an app registration for Bookmark-Page.
2. Add a web redirect URI that matches `OIDC_REDIRECT_URI`, for example `https://bookmarks.example.com/api/v1/auth/oidc/callback`.
3. Create a client secret. Put the application id in `OIDC_CLIENT_ID` and the secret in `OIDC_CLIENT_SECRET`.
4. Set `OIDC_DISCOVERY_URL` to `https://login.microsoftonline.com/<tenant-id>/v2.0`.

## App roles

1. In App roles, add roles whose values are the names you want to map, such as `Bookmark.Admin` and `Bookmark.Editor`.
2. Assign those app roles to users or groups in Enterprise applications.
3. The ID token issued to this client must contain those values in the `roles` claim. Leave `OIDC_ROLE_CLAIM` at `roles`.
4. Map them in `OIDC_ROLE_MAPPING`:

```json
{ "Bookmark.Admin": "admin", "Bookmark.Editor": "editor", "Bookmark.Viewer": "viewer" }
```

A signed-in user with no mapped role becomes a viewer. The user is created on first sign-in.

Set `SESSION_COOKIE_SECURE=true` when the site is served over HTTPS.

## Managed-device automatic sign-in (2.4.0)

Optionally set:

```dotenv
OIDC_AUTO_LOGIN=true
OIDC_PROVIDER_NAME=Microsoft
OIDC_AUTO_LOGIN_RETRY_SECONDS=3600
SESSION_COOKIE_SECURE=true
```

A top-level portal navigation redirects before rendering to Entra with
`prompt=none`. An existing Entra browser session on a managed device can complete
the flow without a sign-in dialog. The app still requests `openid profile email`,
uses state/S256 PKCE, validates the ID token, and maps its configured app-role
claim on every sign-in. This does not bypass consent, account selection,
Conditional Access, MFA or device policy. When silent completion is unavailable
(`login_required`, `interaction_required`, consent/account-selection errors,
access denied or an outage), the portal returns anonymously and suppresses
further attempts for the configured period. **Sign in with Microsoft** starts
an interactive attempt. No tenant-specific automatic-SSO promise is made.

Sign out suppresses automatic sign-in for the browser session. It ends the
Bookmark-Page session, not the Entra browser session; a later explicit sign-in
can therefore reuse Entra SSO. After the app's seven-day session expires, the
next eligible navigation attempts silent sign-in again.

The avatar menu shows the OIDC `name`, canonical user name/e-mail, effective role
and Microsoft provider label. The role in the admin list is provider-managed and
reapplied at the next sign-in. Keep the local break-glass account and its
protected password available through **Emergency local sign-in** when local login
is disabled. See [configuration](configuration.md#automatic-oidc-sign-in-and-account-identity-240)
for cookie, return-path and retry limits, and Microsoft's
[authorization-code flow documentation](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
for `prompt=none` and interactive-policy errors.
