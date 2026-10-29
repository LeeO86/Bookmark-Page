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
