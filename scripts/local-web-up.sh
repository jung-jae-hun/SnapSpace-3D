#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_WEB_PORT="${LOCAL_WEB_PORT:-3400}"

cd "$REPO_ROOT"

if pgrep -f "next dev.*apps/web|apps/web.*next dev" >/dev/null 2>&1; then
  echo "[local-web-up] apps/web next dev process is already running."
  echo "[local-web-up] Stop the existing process first, then run this script again."
  exit 0
fi

echo "[local-web-up] Starting @snapspace/web on port $LOCAL_WEB_PORT"
pnpm --filter @snapspace/web exec next dev -p "$LOCAL_WEB_PORT"