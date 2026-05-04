#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="$REPO_ROOT/.env"
COMPOSE_FILE="$REPO_ROOT/infra/compose/docker-compose.dev.yml"
PROJECT_NAME="snapspace3d"

BENCH_MODES="${BENCH_MODES:-opensrc meshy}"
IMAGE_DIR="${BENCH_IMAGES_DIR:-benchmarks/images}"
OUTPUT_DIR="${BENCH_OUTPUT_DIR:-benchmarks/results}"

mkdir -p "$OUTPUT_DIR"

run_mode() {
  local mode="$1"
  local run_label="$mode"

  if [[ "$mode" == "opensrc" ]]; then
    echo "[bench-compare] switch mode=opensrc (proxy chain)"
    OPENSRC_ENGINE_MODE=proxy \
    OPENSRC_ENGINE_BASE_URL=http://ai-provider-local:7001 \
    AI_PROVIDER_MODE=opensrc \
    AI_PROVIDER_BASE_URL=http://ai-provider-opensrc:7002 \
    docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" --profile opensrc up -d ai-provider-local ai-provider-opensrc api worker

    pnpm dev:docker:verify

    BENCH_PROVIDER_LABEL="$run_label" \
    BENCH_IMAGES_DIR="$IMAGE_DIR" \
    BENCH_OUTPUT_DIR="$OUTPUT_DIR" \
    bash ./scripts/benchmark-provider-quality.sh
    return 0
  fi

  if [[ "$mode" == "meshy" ]]; then
    local meshy_base="${BENCH_MESHY_BASE_URL:-}"
    local meshy_key="${BENCH_MESHY_API_KEY:-}"

    if [[ -z "$meshy_base" || -z "$meshy_key" ]]; then
      echo "[bench-compare] SKIP mode=meshy (missing BENCH_MESHY_BASE_URL or BENCH_MESHY_API_KEY)"
      return 0
    fi

    echo "[bench-compare] switch mode=meshy"
    AI_PROVIDER_MODE=meshy \
    AI_PROVIDER_BASE_URL="$meshy_base" \
    AI_PROVIDER_API_KEY="$meshy_key" \
    docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d api worker web

    pnpm dev:docker:verify

    BENCH_PROVIDER_LABEL="$run_label" \
    BENCH_IMAGES_DIR="$IMAGE_DIR" \
    BENCH_OUTPUT_DIR="$OUTPUT_DIR" \
    bash ./scripts/benchmark-provider-quality.sh
    return 0
  fi

  echo "[bench-compare] SKIP unknown mode=$mode"
}

echo "[bench-compare] modes: $BENCH_MODES"
for mode in $BENCH_MODES; do
  run_mode "$mode"
done

echo "[bench-compare] build summary"
latest_summary="$OUTPUT_DIR/provider-compare-latest.md"

node -e '
const fs = require("node:fs");
const path = require("node:path");
const dir = process.argv[1];
const outPath = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => f.startsWith("benchmark-") && f.endsWith(".json")).sort();
if (files.length === 0) {
  fs.writeFileSync(outPath, "# Provider Compare Summary\n\nNo benchmark json files found.\n");
  process.exit(0);
}
const rows = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const lines = [];
lines.push("# Provider Compare Summary");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push("");
lines.push("| provider | total | ready | failed | other | ready_rate | avg_ready_latency_sec | run_id |");
lines.push("|---|---:|---:|---:|---:|---:|---:|---|");
for (const r of rows) {
  lines.push(`| ${r.provider} | ${r.totals.total} | ${r.totals.ready} | ${r.totals.failed} | ${r.totals.other} | ${(r.rates.readyRate * 100).toFixed(1)}% | ${r.avgReadyLatencySec} | ${r.runId} |`);
}
lines.push("");
lines.push("## Notes");
lines.push("");
lines.push("- shape/detail 인식률은 각 run의 *.manual-review.md에서 수동 점수로 비교하세요.");
fs.writeFileSync(outPath, lines.join("\n"));
' "$OUTPUT_DIR" "$latest_summary"

echo "[bench-compare] DONE"
echo "- summary: $latest_summary"
