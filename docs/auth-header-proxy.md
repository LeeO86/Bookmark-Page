# Trusted header proxy

Use this when a proxy in front of Bookmark-Page has already authenticated the user. Traefik ForwardAuth with oauth2-proxy is the example. Headers are ignored unless the TCP peer is inside `AUTH_TRUSTED_PROXIES`.

```env
AUTH_TRUSTED_HEADER_ENABLED=true
AUTH_TRUSTED_PROXIES=10.0.0.0/8,172.16.0.0/12
AUTH_USER_HEADER=X-Forwarded-User
AUTH_EMAIL_HEADER=X-Forwarded-Email
AUTH_GROUPS_HEADER=X-Forwarded-Groups
AUTH_GROUP_ROLE_MAPPING={"admins":"admin","editors":"editor"}
```

If the header feature is on and `AUTH_TRUSTED_PROXIES` is empty, startup logs a warning and the headers are ignored.

A header user is created on first request. Groups that do not match the mapping leave the user as a viewer. A header identity does not take over an existing local or OpenID Connect username.

## Traefik and oauth2-proxy

`docker/docker-compose.traefik.yml` publishes Bookmark-Page on the external `traefik` network. Put oauth2-proxy on that network and configure Traefik ForwardAuth to call it before the Bookmark-Page router. oauth2-proxy should set the user, email, and groups headers. The address Traefik uses to connect to Bookmark-Page must be inside `AUTH_TRUSTED_PROXIES`.

The session cookie should be Secure behind HTTPS (`SESSION_COOKIE_SECURE=true`). The proxy must not forward client-supplied copies of the identity headers from outside the trusted CIDRs. Bookmark-Page only accepts them from a trusted peer, so a client that talks to the app directly cannot set them.
