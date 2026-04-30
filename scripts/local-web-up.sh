#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_WEB_PORT="${LOCAL_WEB_PORT:-3400}"

cd "$REPO_ROOT"

if ! pnpm --filter @snapspace/web exec node -e "require.resolve('next/package.json')" >/dev/null 2>&1; then
  echo "[local-web-up] Missing web dependencies (next not found)."
  echo "[local-web-up] Run: pnpm install"
  exit 1
fi

if lsof -iTCP:"$LOCAL_WEB_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "[local-web-up] Port $LOCAL_WEB_PORT is already in use."
  echo "[local-web-up] Stop the process using this port, then run this script again."
  lsof -iTCP:"$LOCAL_WEB_PORT" -sTCP:LISTEN -n -P | sed 's/^/[local-web-up] /'
  exit 0
fi

echo "[local-web-up] Starting @snapspace/web on port $LOCAL_WEB_PORT"
echo "[local-web-up] Open: http://localhost:$LOCAL_WEB_PORT"
pnpm --filter @snapspace/web exec next dev -p "$LOCAL_WEB_PORT"