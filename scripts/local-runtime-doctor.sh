#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

echo "[doctor] SnapSpace local runtime doctor"
echo "[doctor] repo: $REPO_ROOT"

echo
echo "[doctor] Listening ports (3000/3300/3400/8080/8081):"
for port in 3000 3300 3400 8080 8081; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "- port $port: IN USE"
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P | sed 's/^/  /'
  else
    echo "- port $port: free"
  fi
done

if lsof -iTCP:3300 -sTCP:LISTEN -n -P | grep -qi 'com\.docke'; then
  echo
  echo "[doctor] Warning: Docker is listening on 3300."
  echo "[doctor] If you run local web, use http://localhost:3400 to avoid mixed runtime (502)."
fi

echo
echo "[doctor] Suggested local commands:"
echo "- API start: pnpm dev:api:local"
echo "- API smoke: pnpm dev:api:local:smoke"
echo "- Web start: pnpm dev:web:local"
echo
echo "[doctor] Notes:"
echo "- Docker often occupies 8080; local API default is 8081 in local-api-up.sh"
echo "- Local web default is 3400 to avoid conflicts with Docker web on 3300"
