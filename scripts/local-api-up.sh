#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.example"

usage() {
  echo "Usage: bash scripts/local-api-up.sh [start|dev|smoke]"
  echo "  start: run @snapspace/api start"
  echo "  dev:   run @snapspace/api dev"
  echo "  smoke: start API, verify health/login, then stop"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# Keep base defaults in sync with the repository template, then override
# Docker-network values to localhost for host-direct execution.
set -a
source "$ENV_FILE"
set +a

API_CMD="${1:-start}"
LOCAL_API_PORT="${LOCAL_API_PORT:-8081}"

case "$API_CMD" in
  start|dev|smoke)
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "[local-api-up] Unsupported command: $API_CMD"
    usage
    exit 1
    ;;
esac

export API_PORT="${API_PORT_OVERRIDE:-$LOCAL_API_PORT}"
export DATABASE_URL="${DATABASE_URL_OVERRIDE:-postgresql://snapspace:snapspace@localhost:5432/snapspace?schema=public}"
export REDIS_URL="${REDIS_URL_OVERRIDE:-redis://localhost:6379}"
export MINIO_ENDPOINT="${MINIO_ENDPOINT_OVERRIDE:-localhost}"

cd "$REPO_ROOT"

echo "[local-api-up] API_CMD=$API_CMD API_PORT=$API_PORT"
echo "[local-api-up] DATABASE_URL=$DATABASE_URL"
echo "[local-api-up] REDIS_URL=$REDIS_URL MINIO_ENDPOINT=$MINIO_ENDPOINT"

if [[ "$API_CMD" == "smoke" ]]; then
  HEALTH_OUT="$(mktemp)"
  LOGIN_OUT="$(mktemp)"
  SERVER_LOG="$(mktemp)"
  API_PID=""

  cleanup() {
    if [[ -n "$API_PID" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
      kill "$API_PID" >/dev/null 2>&1 || true
      wait "$API_PID" >/dev/null 2>&1 || true
    fi
    rm -f "$HEALTH_OUT" "$LOGIN_OUT" "$SERVER_LOG"
  }

  trap cleanup EXIT INT TERM

  echo "[local-api-up] Smoke: starting API in background"
  pnpm --filter @snapspace/api start >"$SERVER_LOG" 2>&1 &
  API_PID="$!"

  HEALTH_URL="http://localhost:${API_PORT}/api/v1/health"
  HEALTH_CODE="$(curl --retry 40 --retry-all-errors --retry-delay 1 -sS -o "$HEALTH_OUT" -w '%{http_code}' "$HEALTH_URL" || true)"
  if [[ "$HEALTH_CODE" != "200" ]]; then
    echo "[local-api-up] Smoke failed: health code=$HEALTH_CODE"
    echo "[local-api-up] --- API log tail ---"
    tail -n 80 "$SERVER_LOG"
    exit 1
  fi

  LOGIN_URL="http://localhost:${API_PORT}/api/v1/auth/login"
  LOGIN_CODE="$(curl --retry 10 --retry-all-errors --retry-delay 1 -sS -o "$LOGIN_OUT" -w '%{http_code}' \
    -X POST "$LOGIN_URL" \
    -H 'Content-Type: application/json' \
    --data '{"email":"owner@snapspace.io","name":"Snap Owner"}' || true)"
  if [[ "$LOGIN_CODE" != "200" && "$LOGIN_CODE" != "201" ]]; then
    echo "[local-api-up] Smoke failed: login code=$LOGIN_CODE"
    echo "[local-api-up] --- Login body ---"
    cat "$LOGIN_OUT"
    echo
    echo "[local-api-up] --- API log tail ---"
    tail -n 80 "$SERVER_LOG"
    exit 1
  fi

  echo "[local-api-up] Smoke passed"
  echo "[local-api-up] Health response:"
  cat "$HEALTH_OUT"
  echo
  echo "[local-api-up] Login response:"
  cat "$LOGIN_OUT"
  echo
  exit 0
fi

pnpm --filter @snapspace/api "$API_CMD"