#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_HOME="${SNAPSPACE_DOCKER_HOME:-/Volumes/MartinData/SERVER/SnapSpace-3D}"
COMPOSE_FILE="$REPO_ROOT/infra/compose/docker-compose.dev.yml"

cd "$DOCKER_HOME"

docker compose \
  --env-file "$DOCKER_HOME/.env" \
  -f "$COMPOSE_FILE" \
  -p snapspace3d \
  down

echo "SnapSpace 3D dev stack is stopped."
