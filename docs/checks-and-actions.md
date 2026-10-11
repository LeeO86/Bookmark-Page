# Checks and actions

Server checks and browser checks are part of this version. Running saved actions is a later milestone. Creating an HTTP check still makes the server request that URL, so treat check targets as intentional access to lab devices. Only an editor or admin can create a check.

## Server checks

The process schedules due checks whose executor is `server`. TCP checks open a connection. HTTP checks send the stored request and compare the status, body text, body pattern, and a dot-separated JSON path. ICMP uses the `ping` command. Without `CAP_NET_RAW` the command cannot open a raw socket; startup logs that, and ICMP checks are stored as `unknown` with that reason instead of being reported as down.

A container that should send ICMP needs `cap_add: [NET_RAW]`. The image installs `iputils-ping` so the command exists once the capability is granted.

`CHECK_MIN_INTERVAL_SECONDS` (default 15) is the fastest a check will run. `CHECK_CONCURRENCY` (default 4) is how many server checks may run at once.

## Browser checks

`POST /api/v1/checks/lease` returns a few due checks the caller is allowed to see and leases them so another browser skips them. The browser then calls `POST /api/v1/checks/{id}/report`. Signed-in users can report. Anonymous visitors can report only when an admin enables “Allow anonymous visitors to run browser checks”.

The browser probe is deliberately weak:

- It uses `fetch` with `mode: "no-cors"` or stops before the request. A successful probe means the request started, not that the device returned a healthy status code.
- An HTTPS page cannot probe an `http://` target. Mixed content is reported as `unknown`.
- Certificate errors and opaque responses make the result unreliable.
- Field values are not sent to the browser. A check URL that uses `{{field.*}}` is not given to the client.
- TCP and ICMP checks leased to a browser are probed as an HTTP request to that host, not as a real TCP or ICMP packet.

## Favicons

Favicon fetches run on the server when a link is saved, when an editor chooses refetch, and again after the configured number of days. TLS verification is off unless an admin enables it, because lab devices often use a private certificate. Only `http` and `https` URLs are fetched, with a 5 second timeout, a 512 KB limit, and at most 3 redirects. A failed fetch keeps the letter avatar.

## Metrics

`GET /metrics` is Prometheus text. It includes the entry count, check states, per-entry check state, check latency, and an action execution counter. Set `METRICS_TOKEN` to require `Authorization: Bearer <token>`. An empty token leaves the endpoint open.
