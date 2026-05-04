#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
COMPOSE_FILE="$REPO_ROOT/infra/compose/docker-compose.dev.yml"
PROJECT_NAME="snapspace3d"
WEB_PORT="${WEB_PORT_OVERRIDE:-3300}"
API_PORT="${API_PORT_OVERRIDE:-8080}"
LOGIN_EMAIL="${VERIFY_LOGIN_EMAIL:-owner@snapspace.io}"
LOGIN_NAME="${VERIFY_LOGIN_NAME:-Snap Owner}"
RETRY_MAX="${VERIFY_RETRY_MAX:-120}"
RETRY_DELAY="${VERIFY_RETRY_DELAY:-1}"
CURL_MAX_TIME="${VERIFY_CURL_MAX_TIME:-8}"

retry_http_code() {
  local method="$1"
  local url="$2"
  local out_file="$3"
  local payload="${4:-}"

  local attempt=1
  local code="000"

  while [[ "$attempt" -le "$RETRY_MAX" ]]; do
    if [[ -n "$payload" ]]; then
      code="$(curl -sS --max-time "$CURL_MAX_TIME" -o "$out_file" -w '%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json' --data "$payload" 2>/dev/null || true)"
    else
      code="$(curl -sS --max-time "$CURL_MAX_TIME" -o "$out_file" -w '%{http_code}' -X "$method" "$url" 2>/dev/null || true)"
    fi

    if [[ "$code" != "000" ]]; then
      echo "$code"
      return 0
    fi

    sleep "$RETRY_DELAY"
    attempt=$((attempt + 1))
  done

  echo "$code"
  return 0
}

print_turbopack_hint_if_needed() {
  local body_file="$1"
  if grep -Eqi 'module not found|turbopack|next/dist|"/_error"|cannot resolve' "$body_file"; then
    echo "[verify:runtime] hint: Next.js dev compile state may be stale (Turbopack/module resolution issue)."
    echo "[verify:runtime] hint: run 'docker restart snapspace-web-dev' then rerun 'pnpm dev:docker:verify'."
  fi
}

usage() {
  echo "Usage: bash scripts/verify-runtime.sh [options]"
  echo ""
  echo "Options:"
  echo "  --web-port <port>   Web endpoint port (default: 3300)"
  echo "  --api-port <port>   API endpoint port (default: 8080)"
  echo "  --email <email>     Login verification email (default: owner@snapspace.io)"
  echo "  --name <name>       Login verification name (default: Snap Owner)"
  echo ""
  echo "Environment overrides:"
  echo "  VERIFY_RETRY_MAX        curl retry count (default: 120)"
  echo "  VERIFY_RETRY_DELAY      curl retry delay seconds (default: 1)"
  echo "  VERIFY_CURL_MAX_TIME    curl max-time seconds per request (default: 8)"
  echo "  -h, --help          Show this help"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --web-port)
      WEB_PORT="$2"
      shift 2
      ;;
    --api-port)
      API_PORT="$2"
      shift 2
      ;;
    --email)
      LOGIN_EMAIL="$2"
      shift 2
      ;;
    --name)
      LOGIN_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[verify:runtime] Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[verify:runtime] Missing $ENV_FILE"
  echo "[verify:runtime] Run: bash $REPO_ROOT/scripts/docker-home-init.sh"
  exit 1
fi

cd "$REPO_ROOT"

echo "[verify:runtime] 1/4 docker 서비스 상태 확인"
docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps

echo "[verify:runtime] 2/4 웹 프록시 응답 확인 (/api/auth/me)"
WEB_OUT="$(mktemp)"
HEALTH_OUT="$(mktemp)"
LOGIN_OUT="$(mktemp)"
trap 'rm -f "$WEB_OUT" "$HEALTH_OUT" "$LOGIN_OUT"' EXIT

WEB_CODE="$(retry_http_code "GET" "http://localhost:${WEB_PORT}/api/auth/me" "$WEB_OUT")"
if [[ "$WEB_CODE" != "401" ]]; then
  echo "[verify:runtime] FAIL: web proxy status=$WEB_CODE (expected 401)"
  cat "$WEB_OUT" || true
  print_turbopack_hint_if_needed "$WEB_OUT"
  echo
  exit 1
fi

echo "[verify:runtime] 3/4 API health 응답 확인"
HEALTH_CODE="$(retry_http_code "GET" "http://localhost:${API_PORT}/api/v1/health" "$HEALTH_OUT")"
if [[ "$HEALTH_CODE" != "200" ]]; then
  echo "[verify:runtime] FAIL: health status=$HEALTH_CODE"
  cat "$HEALTH_OUT" || true
  echo
  exit 1
fi

echo "[verify:runtime] 4/4 웹 경유 로그인 확인"
LOGIN_PAYLOAD="{\"email\":\"${LOGIN_EMAIL}\",\"name\":\"${LOGIN_NAME}\"}"
LOGIN_CODE="$(retry_http_code "POST" "http://localhost:${WEB_PORT}/api/auth/login" "$LOGIN_OUT" "$LOGIN_PAYLOAD")"
if [[ "$LOGIN_CODE" != "200" ]]; then
  echo "[verify:runtime] FAIL: web login status=$LOGIN_CODE"
  echo "[verify:runtime] login body:"
  cat "$LOGIN_OUT"
  print_turbopack_hint_if_needed "$LOGIN_OUT"
  echo
  exit 1
fi

if ! grep -q '"user"' "$LOGIN_OUT"; then
  echo "[verify:runtime] FAIL: login response does not include user payload"
  cat "$LOGIN_OUT"
  print_turbopack_hint_if_needed "$LOGIN_OUT"
  echo
  exit 1
fi

echo "[verify:runtime] PASS"
echo "- web-proxy(auth/me): $WEB_CODE"
echo "- health: $HEALTH_CODE"
echo "- login:  $LOGIN_CODE"
echo "- email:  $LOGIN_EMAIL"