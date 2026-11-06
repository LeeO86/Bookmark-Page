# Checks and actions

Server checks and browser checks run in this version. Actions also run on the server. Creating an HTTP check or an action makes the server request that URL, so treat those targets as intentional access to lab devices. Only an editor or admin can create a check or an action unless the action sets a lower role.

## Server checks

The process schedules due checks whose executor is `server`. TCP checks open a connection. HTTP checks resolve URL, header and body placeholders on the server, send the stored request, and compare the status, body text, body pattern, and a dot-separated JSON path. ICMP uses the `ping` command. Without `CAP_NET_RAW` the command cannot open a raw socket; startup logs that, and ICMP checks are stored as `unknown` with that reason instead of being reported as down.

A container that should send ICMP needs `cap_add: [NET_RAW]`. The image installs `iputils-ping` so the command exists once the capability is granted.

`CHECK_MIN_INTERVAL_SECONDS` (default 15) is the fastest a check will run. `CHECK_CONCURRENCY` (default 4) is how many server checks may run at once.

## Browser checks

`POST /api/v1/checks/lease` returns a few due checks the caller is allowed to see and leases them so another browser skips them. The browser then calls `POST /api/v1/checks/{id}/report`. Signed-in users can report. Anonymous visitors can report only when an admin enables “Allow anonymous visitors to run browser checks”.

The ordinary HTTP/TCP/ICMP browser probe is deliberately weak:

- It uses `fetch` with `mode: "no-cors"` or stops before the request. A successful probe means the request started, not that the device returned a healthy status code.
- An HTTPS page cannot probe an `http://` target. Mixed content is reported as `unknown`.
- Certificate errors and opaque responses make the result unreliable. An explicitly detected CSP block is `unknown`, rather than a device outage. The application permits HTTP(S) probe connections; a reverse proxy may impose a stricter CSP.
- Field values are not sent to the browser. A check URL that uses `{{field.*}}` is not given to the client.
- TCP and ICMP checks leased to a browser are probed as an HTTP request to that host, not as a real TCP or ICMP packet.

## Actions

An action is an HTTP request made by this server, not by the browser. Entry actions belong to one entry. An action template has a query and appears on every visible entry that matches it. The default role is editor. A non-GET action asks for confirmation unless that was turned off.

`POST /api/v1/entries/{id}/actions/{name}/execute` with `{ "confirmed": true, "inputs": {} }` runs it. Placeholders `{{host}}`, `{{entry.name}}`, `{{field.<key>}}`, and `{{input.<name>}}` are filled on the server. All nonempty secret field values and password inputs, including short PINs, are removed from the result and from the audit log. The response body shown in the UI is limited to 4 KB.

This is intentional access from the server to the target URL, which may be a private device. Only a caller whose role and token scope allow the action can run it. Executions are rate-limited per user (`ACTION_RATE_LIMIT`, default 30 per 15 minutes).

## Favicons

Favicon fetches run on the server when a link is saved, when an editor chooses refetch, and again after the configured number of days. TLS verification is off unless an admin enables it, because lab devices often use a private certificate. Only `http` and `https` URLs are fetched, with a 5 second timeout, a 512 KB limit, and at most 3 redirects. A failed fetch retains the last good or supplied image; without an image it keeps the letter avatar.

## Metrics

`GET /metrics` is Prometheus text. It includes the entry count, check states, per-entry check state, check latency, and an action execution counter. Set `METRICS_TOKEN` to require `Authorization: Bearer <token>`. An empty token leaves the endpoint open.

## Image checks

`kind: image` supports `executor: client` and `executor: server`. The default
URL is the entry's explicit HTTP(S) favicon URL, otherwise the primary link's
origin plus `/favicon.ico`. Optionally set `requestSpec.urlTemplate` (GET only);
`{{host}}` is supported. A data URI or a secret-backed/unresolved link cannot
establish live availability and stays unknown. Field placeholders are withheld.

The browser uses `new Image()` with a timeout, without reading cross-origin
bytes. A load means up; an error or timeout means down. A reachable device that
returns HTML or another non-image response also counts as down. Each probe adds
`_bp_check=<nonce>` to avoid falsely reporting cached images as live; image
endpoints must tolerate that query parameter. Displayed, supplied or cached
favicons are never used as the probe result.

Unlike ordinary fetch checks, an image check attempts the load on an HTTPS
portal. This does **not** bypass mixed-content, certificate or local-network
restrictions. The actual Chromium/Firefox differences and exact CSP allowlist
are documented in [configuration](configuration.md#https-portal-compatibility).
A blocked image can mean down even when the device itself is reachable. Reload
after configuring a new image origin. Anonymous image checks require the same
admin permission setting as other browser checks.

The server executor performs a bounded GET using the check's TLS verification
and timeout, plus `FAVICON_MAX_BYTES`
and validates the response as ICO, PNG, SVG, WebP, JPEG or GIF; SVG sanitising also
applies. A non-2xx, malformed image or timeout means down. It does not write the
favicon cache. For a server that can ping but cannot HTTP devices, use a server
ICMP check for dependable reachability and supplied images for display.

## Server-check capacity and fairness (2.4.2)

The scheduler discovers newly due work every five seconds and at startup.
Never-run server checks are first, then the oldest `checkedAt` results; stable
creation/id ties keep ordering predictable. When a probe finishes (including a
timeout or failure), its slot immediately starts the next due probe. The five
second discovery tick no longer limits a batch to `CHECK_CONCURRENCY` starts.
Edits/deletions are read again between probes; client-executed checks are excluded.

Capacity still depends on probe duration. Roughly, `concurrency / mean duration`
is the sustainable checks/second; all-down devices occupy slots until timeout.
For example, four slots with five-second probes sustain about 48 checks/minute;
164 checks/minute need at least 14 slots at that duration, plus operating headroom.
`CHECK_CONCURRENCY=32` may suit that workload if the host/network can support it.
Increasing the interval or reducing a suitable timeout also reduces pressure.

A check is overdue when it has waited more than one additional effective interval
past its due time. Never-run checks are due from creation; completed checks are
due from `checkedAt + max(interval, CHECK_MIN_INTERVAL_SECONDS)`. At most once a
minute, the scheduler warns with `CHECK_CONCURRENCY`, overdue count and maximum
delay. `/metrics` exposes `bookmark_server_check_concurrency`,
`bookmark_server_checks_in_flight`, `bookmark_server_checks_due`,
`bookmark_server_checks_overdue` and `bookmark_server_check_max_overdue_seconds`.
Due/overdue counts include currently running probes until their result arrives;
metric access retains the existing optional `METRICS_TOKEN` protection.
