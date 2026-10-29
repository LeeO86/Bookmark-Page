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
3. The access token then contains those values in the `roles` claim. Leave `OIDC_ROLE_CLAIM` at `roles`.
4. Map them in `OIDC_ROLE_MAPPING`:

```json
{ "Bookmark.Admin": "admin", "Bookmark.Editor": "editor", "Bookmark.Viewer": "viewer" }
```

A signed-in user with no mapped role becomes a viewer. The user is created on first sign-in.

Set `SESSION_COOKIE_SECURE=true` when the site is served over HTTPS.
