#!/usr/bin/env bash
set -euo pipefail

image=${1:?Usage: bash docker/test-offline.sh IMAGE}
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

# Synthetic disposable data only. The container has loopback and no external route.
container_id=$(docker run -d --network none --tmpfs /data:uid=1000,gid=1000 \
  -e BOOKMARK_SECRET_KEY=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc= \
  -e BOOKMARK_FAVICON_FETCH=0 -e BOOKMARK_MONITORS=0 "$image")
docker exec -i "$container_id" node --input-type=module < "$script_dir/offline-smoke.mjs"
