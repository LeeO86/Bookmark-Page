# Keycloak

Bookmark-Page is a confidential OpenID Connect client. Roles can come from Keycloak realm roles or client roles. For LDAP or Active Directory, connect the directory with User Federation and map directory groups to Keycloak roles. Bookmark-Page only sees the role claim.

## Client

1. Create an OpenID Connect client. Set the access type to confidential.
2. Set the valid redirect URI to `OIDC_REDIRECT_URI`, for example `https://bookmarks.example.com/api/v1/auth/oidc/callback`.
3. Copy the client id and secret to `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`.
4. Set `OIDC_DISCOVERY_URL` to `https://keycloak.example.com/realms/<realm>/.well-known/openid-configuration`.

## Role mapper

1. Create realm or client roles named for the mapping, such as `bookmark-admin`.
2. Add a protocol mapper that puts those role names into the claim configured by `OIDC_ROLE_CLAIM`. The default claim is `roles`.
3. Map the claim values:

```json
{ "bookmark-admin": "admin", "bookmark-editor": "editor" }
```

Unmapped users become viewers and are created on first sign-in.

## LDAP and Active Directory

Use Keycloak User Federation rather than sending directory groups straight to Bookmark-Page.

1. Add an LDAP user federation provider for the directory.
2. Sync users and groups.
3. Map directory groups to the Keycloak roles above with a group-to-role mapping.
4. Keep `OIDC_ROLE_MAPPING` pointed at those role names.

Set `SESSION_COOKIE_SECURE=true` when the site is served over HTTPS.

## Optional automatic sign-in (2.4.0)

Set `OIDC_AUTO_LOGIN=true` and optionally `OIDC_PROVIDER_NAME=Keycloak`.
Eligible top-level navigations use `prompt=none` before the portal is rendered.
An existing Keycloak browser session may complete silently; a required login,
consent/account-selection step, expired upstream session or provider failure
returns to the public portal and sets a retry-suppression cookie (3600 seconds by
default). The primary **Sign in with Keycloak** button performs the interactive
flow, preserving the current path. Normal API/asset/monitoring calls never
trigger automatic redirects.

Sign out suppresses automatic sign-in for the browser session and closes only
the Bookmark-Page session. Successful explicit sign-in clears suppression.
`name` is refreshed and backed up as the user's display name; the mapped role is
reapplied on every sign-in and shown with the provider label in the account menu.
Use `SESSION_COOKIE_SECURE=true` behind HTTPS and retain a break-glass account.
[Configuration](configuration.md#automatic-oidc-sign-in-and-account-identity-240)
describes cookie/transaction limits and provider-error handling.
