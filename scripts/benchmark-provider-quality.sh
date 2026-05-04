#!/usr/bin/env bash
set -euo pipefail

WEB_BASE="${BENCH_WEB_BASE:-http://localhost:3300}"
IMAGE_DIR="${BENCH_IMAGES_DIR:-benchmarks/images}"
OUTPUT_DIR="${BENCH_OUTPUT_DIR:-benchmarks/results}"
PROVIDER_LABEL="${BENCH_PROVIDER_LABEL:-unknown}"
POLL_MAX="${BENCH_POLL_MAX:-40}"
POLL_DELAY_SEC="${BENCH_POLL_DELAY_SEC:-2}"
CURL_MAX_TIME="${BENCH_CURL_MAX_TIME:-25}"
DEFAULT_PROMPT="${BENCH_DEFAULT_PROMPT:-single furniture object, clean silhouette}"

TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/cookies.txt"
RESP_FILE="$TMP_DIR/resp.json"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$OUTPUT_DIR"

if [[ ! -d "$IMAGE_DIR" ]]; then
  echo "[bench] FAIL: image dir not found: $IMAGE_DIR"
  exit 1
fi

IMAGES=()
while IFS= read -r img; do
  IMAGES+=("$img")
done < <(find "$IMAGE_DIR" -maxdepth 1 -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | sort)
if [[ "${#IMAGES[@]}" -eq 0 ]]; then
  echo "[bench] FAIL: no image files in $IMAGE_DIR"
  echo "[bench] add .png/.jpg/.jpeg/.webp files and retry"
  exit 1
fi

request_json() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS --max-time "$CURL_MAX_TIME" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -H 'Content-Type: application/json' -X "$method" "$url" --data "$body" > "$RESP_FILE"
  else
    curl -sS --max-time "$CURL_MAX_TIME" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      -X "$method" "$url" > "$RESP_FILE"
  fi
}

json_get() {
  local key_path="$1"
  node -e '
const fs = require("node:fs");
const p = process.argv[1].split(".");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let cur = data;
for (const key of p) {
  if (!cur || typeof cur !== "object") {
    process.exit(1);
  }
  cur = cur[key];
}
if (cur === undefined || cur === null) process.exit(1);
process.stdout.write(String(cur));
' "$key_path" "$RESP_FILE"
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/-+/-/g; s/^-|-$//g'
}

run_id="$(date +%Y%m%d-%H%M%S)-$(slugify "$PROVIDER_LABEL")"
csv_file="$OUTPUT_DIR/benchmark-$run_id.csv"
json_file="$OUTPUT_DIR/benchmark-$run_id.json"
md_file="$OUTPUT_DIR/benchmark-$run_id.manual-review.md"

echo "provider,image,prompt,status,polls,elapsed_sec,generation_id,object_definition_id,error_message" > "$csv_file"

echo "[bench] login via web proxy"
bench_email="bench-$(date +%s)@snapspace.local"
bench_name="Provider Benchmark"
request_json "POST" "$WEB_BASE/api/auth/login" "{\"email\":\"$bench_email\",\"name\":\"$bench_name\"}"
if ! grep -q 'snapspace_access_token' "$COOKIE_JAR"; then
  echo "[bench] FAIL: login cookie missing"
  cat "$RESP_FILE"
  exit 1
fi

echo "[bench] create benchmark project/scene"
request_json "POST" "$WEB_BASE/api/projects" '{"name":"Provider Benchmark Project","description":"provider quality benchmark"}'
PROJECT_ID="$(json_get id || true)"
if [[ -z "$PROJECT_ID" ]]; then
  echo "[bench] FAIL: project create failed"
  cat "$RESP_FILE"
  exit 1
fi

request_json "POST" "$WEB_BASE/api/projects/$PROJECT_ID/scenes" '{"name":"Provider Benchmark Scene"}'
SCENE_ID="$(json_get id || true)"
if [[ -z "$SCENE_ID" ]]; then
  echo "[bench] FAIL: scene create failed"
  cat "$RESP_FILE"
  exit 1
fi

ready_count=0
failed_count=0
other_count=0
total=0

for img in "${IMAGES[@]}"; do
  total=$((total + 1))
  base_name="$(basename "$img")"
  stem="${base_name%.*}"
  prompt_file="$IMAGE_DIR/$stem.txt"
  prompt="$DEFAULT_PROMPT"
  if [[ -f "$prompt_file" ]]; then
    prompt="$(cat "$prompt_file")"
  fi

  object_key="images/ai-bench/$SCENE_ID/$(date +%s)-$base_name"

  echo "[bench] [$total/${#IMAGES[@]}] upload ticket: $base_name"
  request_json "POST" "$WEB_BASE/api/assets/upload-url" "{\"objectKey\":\"$object_key\",\"contentType\":\"image/png\"}"
  upload_url="$(json_get uploadUrl || true)"
  if [[ -z "$upload_url" ]]; then
    echo "[bench] WARN: upload url missing for $base_name"
    echo "$PROVIDER_LABEL,$base_name,\"$prompt\",failed,0,0,,,upload_url_missing" >> "$csv_file"
    failed_count=$((failed_count + 1))
    continue
  fi

  upload_code="$(curl -sS --max-time "$CURL_MAX_TIME" -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X PUT "$WEB_BASE$upload_url" -H 'Content-Type: image/png' --data-binary "@$img" || true)"
  if [[ "$upload_code" -lt 200 || "$upload_code" -ge 300 ]]; then
    echo "[bench] WARN: upload failed for $base_name status=$upload_code"
    echo "$PROVIDER_LABEL,$base_name,\"$prompt\",failed,0,0,,,upload_failed_$upload_code" >> "$csv_file"
    failed_count=$((failed_count + 1))
    continue
  fi

  request_json "POST" "$WEB_BASE/api/ai/generations" "{\"sceneId\":\"$SCENE_ID\",\"sourceImageAssetId\":\"$object_key\",\"prompt\":\"$prompt\",\"quality\":\"standard\"}"
  gen_id="$(json_get id || true)"
  if [[ -z "$gen_id" ]]; then
    echo "[bench] WARN: generation create failed for $base_name"
    msg="$(json_get message || true)"
    echo "$PROVIDER_LABEL,$base_name,\"$prompt\",failed,0,0,,,$msg" >> "$csv_file"
    failed_count=$((failed_count + 1))
    continue
  fi

  start_ts="$(date +%s)"
  status="queued"
  polls=0
  error_msg=""

  for ((i=1; i<=POLL_MAX; i++)); do
    polls=$i
    request_json "GET" "$WEB_BASE/api/ai/generations/$gen_id"
    status="$(json_get status || true)"
    if [[ "$status" == "ready" ]]; then
      break
    fi
    if [[ "$status" == "failed" ]]; then
      error_msg="$(json_get errorMessage || true)"
      break
    fi
    sleep "$POLL_DELAY_SEC"
  done

  end_ts="$(date +%s)"
  elapsed=$((end_ts - start_ts))
  object_def_id=""

  if [[ "$status" == "ready" ]]; then
    request_json "POST" "$WEB_BASE/api/ai/generations/$gen_id/promote"
    object_def_id="$(json_get id || true)"
    ready_count=$((ready_count + 1))
  elif [[ "$status" == "failed" ]]; then
    failed_count=$((failed_count + 1))
  else
    other_count=$((other_count + 1))
  fi

  safe_prompt="${prompt//\"/\"\"}"
  safe_error="${error_msg//\"/\"\"}"
  echo "$PROVIDER_LABEL,$base_name,\"$safe_prompt\",$status,$polls,$elapsed,$gen_id,$object_def_id,\"$safe_error\"" >> "$csv_file"
  echo "[bench] done: $base_name status=$status elapsed=${elapsed}s"
done

node -e '
const fs = require("node:fs");
const csv = fs.readFileSync(process.argv[1], "utf8").trim().split(/\r?\n/);
const rows = csv.slice(1).filter(Boolean).map((line) => {
  const parts = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQ && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (ch === "," && !inQ) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return {
    provider: parts[0],
    image: parts[1],
    prompt: parts[2],
    status: parts[3],
    polls: Number(parts[4] || 0),
    elapsedSec: Number(parts[5] || 0),
    generationId: parts[6],
    objectDefinitionId: parts[7],
    errorMessage: parts[8] || ""
  };
});
const total = rows.length;
const ready = rows.filter((r) => r.status === "ready").length;
const failed = rows.filter((r) => r.status === "failed").length;
const avgSec = ready > 0 ? rows.filter((r) => r.status === "ready").reduce((s, r) => s + r.elapsedSec, 0) / ready : 0;
const out = {
  runId: process.argv[2],
  provider: process.argv[3],
  generatedAt: new Date().toISOString(),
  totals: { total, ready, failed, other: total - ready - failed },
  rates: { readyRate: total > 0 ? ready / total : 0, failedRate: total > 0 ? failed / total : 0 },
  avgReadyLatencySec: Number(avgSec.toFixed(2)),
  rows
};
fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 2));
' "$csv_file" "$run_id" "$PROVIDER_LABEL" "$json_file"

{
  echo "# Manual Quality Review Template"
  echo ""
  echo "- run_id: $run_id"
  echo "- provider: $PROVIDER_LABEL"
  echo "- csv: $(basename "$csv_file")"
  echo "- json: $(basename "$json_file")"
  echo ""
  echo "| image | status | elapsed_sec | shape_match(1-5) | detail_match(1-5) | usability(1-5) | notes |"
  echo "|---|---:|---:|---:|---:|---:|---|"
  node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const row of report.rows || []) {
  const image = String(row.image || "").replace(/\|/g, "\\|");
  const status = String(row.status || "").replace(/\|/g, "\\|");
  const elapsed = Number(row.elapsedSec || 0);
  process.stdout.write(`| ${image} | ${status} | ${elapsed} |  |  |  |  |\n`);
}
' "$json_file"
} > "$md_file"

echo "[bench] PASS"
echo "- csv:  $csv_file"
echo "- json: $json_file"
echo "- md:   $md_file"
