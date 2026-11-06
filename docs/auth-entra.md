# Microsoft Entra ID

Use an App Registration and App Roles. Do not use the `groups` claim for authorization. Large tenants hit the group overage limit, and the token then omits the groups the mapping needs.

## App registration

1. In Entra ID, create an app registration for Bookmark-Page.
2. Add a web redirect URI that matches `OIDC_REDIRECT_URI`, for example `https://bookmarks.example.com/api/v1/auth/oidc/callback`.
3. Create a client secret. Put the application id in `OIDC_CLIENT_ID` and the secret in `OIDC_CLIENT_SECRET`.
4. Set `OIDC_DISCOVERY_URL` to `https://login.microsoftonline.com/<tenant-id>/v2.0`.

## App roles: map the Value from the ID token

Define app roles for users in the app registration, then assign users/groups in
**Enterprise applications → Users and groups**. The **Value** is the string in
this client's **ID token** `roles` claim; the **Display name** is the label shown
in assignment screens. `OIDC_ROLE_MAPPING` keys must match the Value exactly,
including case. A display name by itself is not a mapping key.

For example, these are distinct settings:

| Display name    | Value  | Portal role |
| --------------- | ------ | ----------- |
| Bookmark.Admin  | admin  | admin       |
| Bookmark.Editor | editor | editor      |
| Bookmark.Viewer | viewer | viewer      |

With those Values, use:

```dotenv
OIDC_ROLE_CLAIM=roles
OIDC_ROLE_MAPPING={"admin":"admin","editor":"editor","viewer":"viewer"}
```

If your existing Values are `Bookmark.Admin`/`Bookmark.Editor`/`Bookmark.Viewer`,
keep those exact keys instead. No role or mapping is changed automatically.
Bookmark-Page reads the verified ID token (`tokens.claims()`), not the access
token obtained with `openid profile email`; that access token is for Microsoft
Graph in this flow. See Microsoft's [app-role documentation](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps).

Assignments apply to a directly assigned user or a **direct member** of an
assigned group. Nested-group membership does not inherit the app assignment or
role. With **Assignment required** enabled, nested membership alone cannot sign
the user in. Use flat security groups, direct assignments or a dynamic group
whose rule makes the required users direct members. See Microsoft's
[group-assignment limits](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/assign-user-or-group-access-portal).

A signed-in user without a mapped value becomes a Viewer. At sign-in, the server
logs that fallback with the verified issuer/subject, configured claim name and
received string values; it never logs the token. **Admin → Users** shows the
last received values, timestamp and whether any value matched. This distinguishes
an intentionally mapped Viewer from a missing/mismatched assignment. Diagnostics
refresh at each sign-in, are admin-only, are retained in backups and are null
for older users/archives. The stored/logged list is bounded to 200 values of
1000 characters each, with truncation indicated; mapping uses the full claim.
Non-string values are ignored and indicated. No directory/Graph lookup is added.

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
