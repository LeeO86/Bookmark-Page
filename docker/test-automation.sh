#!/usr/bin/env bash
set -euo pipefail
image=${1:?Usage: bash docker/test-automation.sh IMAGE}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
container_id=''
cleanup() {
  local status=$?
  if [[ -n "$container_id" ]]; then
    if (( status != 0 )); then docker logs "$container_id" >&2; fi
    docker rm -f "$container_id" >/dev/null
  fi
}
trap cleanup EXIT
# Public fixture credentials, valid only for this disposable isolated container.
container_id=$(docker run -d --network none --tmpfs /data:uid=1000,gid=1000 \
  -e BOOKMARK_SECRET_KEY=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc= \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=admin-pass-1 \
  -e ADMIN_API_TOKEN=bp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  -e BOOKMARK_FAVICON_FETCH=1 -e BOOKMARK_MONITORS=0 "$image")
docker exec -i "$container_id" node --input-type=module < "$script_dir/automation-smoke.mjs"
