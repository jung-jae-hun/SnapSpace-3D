#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_HOME="${SNAPSPACE_DOCKER_HOME:-$REPO_ROOT}"

mkdir -p "$DOCKER_HOME"

if [[ ! -f "$DOCKER_HOME/.env" ]]; then
  cp "$REPO_ROOT/.env.example" "$DOCKER_HOME/.env"
  echo "Created $DOCKER_HOME/.env from .env.example"
else
  echo "Already exists: $DOCKER_HOME/.env"
fi

cat > "$DOCKER_HOME/README.md" <<EOF
# SnapSpace 3D Docker Home

이 폴더는 SnapSpace 3D Docker 실행 기준 폴더입니다.

- 기본 경로: 레포 루트($REPO_ROOT)
- 이 폴더의 .env를 기준으로 Docker 실행

실행 예시:
1) bash $REPO_ROOT/scripts/docker-home-up.sh
2) bash $REPO_ROOT/scripts/docker-home-down.sh
EOF

echo "Docker home is ready: $DOCKER_HOME"
