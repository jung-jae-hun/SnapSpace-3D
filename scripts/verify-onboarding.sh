#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[verify:onboarding] 1/4 bootstrap 실행"
pnpm run bootstrap

echo "[verify:onboarding] 2/4 품질게이트 실행"
pnpm run ci:quality

echo "[verify:onboarding] 3/4 스모크 스크립트 문법 점검"
node --check scripts/smoke-flow.mjs

echo "[verify:onboarding] 4/4 결과 안내"
echo "- 인프라(API/DB/Redis/Worker) 기동 후: pnpm run smoke:flow"
echo "- 완료: 신규 개발자 bootstrap 1회 재현성 + 품질게이트 통과"
