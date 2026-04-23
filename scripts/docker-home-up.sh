#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_HOME="${SNAPSPACE_DOCKER_HOME:-/Volumes/MartinData/SERVER/SnapSpace-3D}"
COMPOSE_FILE="$REPO_ROOT/infra/compose/docker-compose.dev.yml"

if [[ ! -f "$DOCKER_HOME/.env" ]]; then
  echo "Missing $DOCKER_HOME/.env. Run: bash $REPO_ROOT/scripts/docker-home-init.sh"
  exit 1
fi

cd "$DOCKER_HOME"

docker compose \
  --env-file "$DOCKER_HOME/.env" \
  -f "$COMPOSE_FILE" \
  -p snapspace3d \
  up --build -d

echo "SnapSpace 3D dev stack is running from Docker home: $DOCKER_HOME"
