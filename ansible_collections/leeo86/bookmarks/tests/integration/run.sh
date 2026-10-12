#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
export ANSIBLE_COLLECTIONS_PATH="${ANSIBLE_COLLECTIONS_PATH:-$ROOT}"
: "${API_URL:?Set API_URL}"
: "${API_TOKEN:?Set API_TOKEN}"
: "${V1_URL:?Set V1_URL}"
ansible-playbook \
  "$ROOT/ansible_collections/leeo86/bookmarks/tests/integration/site.yml" \
  -i "$ROOT/ansible_collections/leeo86/bookmarks/tests/integration/inventory.yml" \
  -e "api_url=${API_URL}" \
  -e "api_token=${API_TOKEN}" \
  -e "v1_url=${V1_URL}" \
  -e "validate_certs=${VALIDATE_CERTS:-false}"
