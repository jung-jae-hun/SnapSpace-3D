#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
COMPOSE_FILE="$REPO_ROOT/infra/compose/docker-compose.dev.yml"
PROJECT_NAME="snapspace3d"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[verify:runtime] Missing $ENV_FILE"
  echo "[verify:runtime] Run: bash $REPO_ROOT/scripts/docker-home-init.sh"
  exit 1
fi

cd "$REPO_ROOT"

echo "[verify:runtime] 1/4 docker 서비스 상태 확인"
docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps

echo "[verify:runtime] 2/4 웹 3300 응답 확인"
WEB_OUT="$(mktemp)"
HEALTH_OUT="$(mktemp)"
LOGIN_OUT="$(mktemp)"
trap 'rm -f "$WEB_OUT" "$HEALTH_OUT" "$LOGIN_OUT"' EXIT

WEB_CODE="$(curl --retry 40 --retry-all-errors --retry-delay 1 -sS -o "$WEB_OUT" -w '%{http_code}' http://localhost:3300)"
if [[ "$WEB_CODE" != "200" ]]; then
  echo "[verify:runtime] FAIL: web status=$WEB_CODE"
  exit 1
fi

echo "[verify:runtime] 3/4 API health 응답 확인"
HEALTH_CODE="$(curl --retry 40 --retry-all-errors --retry-delay 1 -sS -o "$HEALTH_OUT" -w '%{http_code}' http://localhost:8080/api/v1/health)"
if [[ "$HEALTH_CODE" != "200" ]]; then
  echo "[verify:runtime] FAIL: health status=$HEALTH_CODE"
  exit 1
fi

echo "[verify:runtime] 4/4 웹 경유 로그인 확인"
LOGIN_CODE="$(curl --retry 40 --retry-all-errors --retry-delay 1 -sS -o "$LOGIN_OUT" -w '%{http_code}' \
  -X POST http://localhost:3300/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"owner@snapspace.io","name":"Snap Owner"}')"
if [[ "$LOGIN_CODE" != "200" ]]; then
  echo "[verify:runtime] FAIL: web login status=$LOGIN_CODE"
  echo "[verify:runtime] login body:"
  cat "$LOGIN_OUT"
  echo
  exit 1
fi

if ! grep -q '"user"' "$LOGIN_OUT"; then
  echo "[verify:runtime] FAIL: login response does not include user payload"
  cat "$LOGIN_OUT"
  echo
  exit 1
fi

echo "[verify:runtime] PASS"
echo "- web:    $WEB_CODE"
echo "- health: $HEALTH_CODE"
echo "- login:  $LOGIN_CODE"