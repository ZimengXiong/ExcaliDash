#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.lab.yml"

cd "${ROOT_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

check_url() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"
  local status

  status="$(curl -fsS -o /dev/null -w "%{http_code}" "${url}" || true)"
  if [[ "${status}" != "${expected}" ]]; then
    echo "FAIL ${name}: ${url} returned ${status:-no response}, expected ${expected}" >&2
    return 1
  fi

  echo "OK   ${name}: ${url}"
}

echo "Checking container state..."
docker compose -f "${COMPOSE_FILE}" ps

echo
echo "Checking app frontends..."
check_url "basic" "http://localhost:1101/"
check_url "basic + SeaweedFS" "http://localhost:1102/"
check_url "OIDC enforced" "http://localhost:1103/"
check_url "hybrid" "http://localhost:1104/"
check_url "trusted proxy" "http://localhost:1105/"

echo
echo "Checking backend health through each frontend proxy..."
check_url "basic health" "http://localhost:1101/api/health"
check_url "basic + SeaweedFS health" "http://localhost:1102/api/health"
check_url "OIDC health" "http://localhost:1103/api/health"
check_url "hybrid health" "http://localhost:1104/api/health"
check_url "trusted proxy health" "http://localhost:1105/api/health"

echo
echo "Checking SeaweedFS S3 API..."
docker compose -f "${COMPOSE_FILE}" run --rm --entrypoint /bin/sh seaweedfs-init -c '
  set -e
  aws --endpoint-url http://seaweedfs:8333 s3api create-bucket --bucket excalidash-lab >/dev/null 2>&1 || true
  aws --endpoint-url http://seaweedfs:8333 s3api head-bucket --bucket excalidash-lab >/dev/null
  printf lab-smoke > /tmp/lab-smoke.txt
  aws --endpoint-url http://seaweedfs:8333 s3api put-object --bucket excalidash-lab --key smoke/lab-smoke.txt --body /tmp/lab-smoke.txt >/dev/null
  aws --endpoint-url http://seaweedfs:8333 s3api head-object --bucket excalidash-lab --key smoke/lab-smoke.txt >/dev/null
  aws --endpoint-url http://seaweedfs:8333 s3api delete-object --bucket excalidash-lab --key smoke/lab-smoke.txt >/dev/null
' >/dev/null

echo "OK   SeaweedFS S3 bucket/object round trip: excalidash-lab"

echo
echo "Lab smoke checks passed."
