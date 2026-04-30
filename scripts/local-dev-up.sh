#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_WEB_PORT="${LOCAL_WEB_PORT:-3400}"
cd "$REPO_ROOT"

usage() {
  echo "Usage: bash scripts/local-dev-up.sh"
  echo "- Starts API dev mode and web dev mode together"
  echo "- If one side is already running, starts only the missing side"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  usage
  exit 0
fi

is_web_running() {
  lsof -iTCP:"$LOCAL_WEB_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

is_api_running() {
  local api_port="${API_PORT_OVERRIDE:-${LOCAL_API_PORT:-8081}}"
  lsof -iTCP:"$api_port" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

if is_api_running && is_web_running; then
  echo "[local-dev-up] API and web dev are already running."
  exit 0
fi

if is_web_running; then
  echo "[local-dev-up] Existing web dev process detected on port $LOCAL_WEB_PORT."
  echo "[local-dev-up] Running API dev only."
  exec bash ./scripts/local-api-up.sh dev
fi

if is_api_running; then
  echo "[local-dev-up] Existing API process detected."
  echo "[local-dev-up] Running web dev only."
  exec bash ./scripts/local-web-up.sh
fi

API_PID=""
cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

echo "[local-dev-up] Starting API dev in background"
bash ./scripts/local-api-up.sh dev &
API_PID="$!"

echo "[local-dev-up] Starting web dev"
bash ./scripts/local-web-up.sh
