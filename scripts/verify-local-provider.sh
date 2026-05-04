#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BASE_URL="${AI_PROVIDER_BASE_URL:-http://localhost:7001}"
SUBMIT_PATH="${AI_PROVIDER_SUBMIT_PATH:-/v1/image-to-3d/jobs}"
STATUS_PATH_TEMPLATE="${AI_PROVIDER_STATUS_PATH:-/v1/image-to-3d/jobs/{jobId}}"
SOURCE_IMAGE_REF="${LOCAL_PROVIDER_VERIFY_SOURCE_IMAGE_REF:-generated/ai/local-verify/input.png}"
PROMPT="${LOCAL_PROVIDER_VERIFY_PROMPT:-a simple wooden chair, clean silhouette}"
QUALITY="${LOCAL_PROVIDER_VERIFY_QUALITY:-low}"
POLL_MAX="${LOCAL_PROVIDER_VERIFY_POLL_MAX:-30}"
POLL_DELAY="${LOCAL_PROVIDER_VERIFY_POLL_DELAY:-2}"
CURL_MAX_TIME="${LOCAL_PROVIDER_VERIFY_CURL_MAX_TIME:-15}"

SUBMIT_JOB_ID_PATHS="${AI_PROVIDER_SUBMIT_JOB_ID_PATHS:-jobId,id,result.id,data.id,result.jobId,job_id,task_id,data.task_id,result.task_id}"
POLL_STATUS_PATHS="${AI_PROVIDER_POLL_STATUS_PATHS:-status,state,result.status,data.status,result.state,data.state}"
POLL_PROGRESS_PATHS="${AI_PROVIDER_POLL_PROGRESS_PATHS:-progress,percentage,percent,result.progress,data.progress,result.percentage,data.percentage}"
POLL_ERROR_MESSAGE_PATHS="${AI_PROVIDER_POLL_ERROR_MESSAGE_PATHS:-errorMessage,message,error.message,result.error.message,data.error.message,errorMessage.value}"
POLL_GLB_URL_PATHS="${AI_PROVIDER_POLL_GLB_URL_PATHS:-output.glbUrl,output.modelUrl,result.output.glbUrl,result.output.modelUrl,data.output.glbUrl,data.output.modelUrl,result.model_urls.glb,result.model_urls.glb_url,model_urls.glb,model_urls.glb_url,output.glb_url,result.output.glb_url,data.output.glb_url}"
POLL_PREVIEW_URL_PATHS="${AI_PROVIDER_POLL_PREVIEW_URL_PATHS:-output.previewImageUrl,output.thumbnailUrl,result.output.previewImageUrl,result.output.thumbnailUrl,data.output.previewImageUrl,data.output.thumbnailUrl,result.thumbnail_url,thumbnail_url,output.preview_url,result.output.preview_url,data.output.preview_url}"

AUTH_TOKEN="${AI_PROVIDER_API_KEY:-}"

curl_with_optional_auth() {
  if [[ -n "$AUTH_TOKEN" ]]; then
    curl "$@" -H "Authorization: Bearer ${AUTH_TOKEN}"
    return
  fi
  curl "$@"
}

json_pick_first() {
  local json="$1"
  local paths_csv="$2"
  node -e '
const input = process.argv[1];
const paths = (process.argv[2] || "").split(",").map((p) => p.trim()).filter(Boolean);
let payload;
try {
  payload = JSON.parse(input);
} catch {
  process.exit(0);
}
function getByPath(obj, path) {
  return path.split(".").reduce((acc, seg) => {
    if (acc && typeof acc === "object") {
      return acc[seg];
    }
    return undefined;
  }, obj);
}
for (const path of paths) {
  const value = getByPath(payload, path);
  if (typeof value === "string" && value.trim()) {
    process.stdout.write(value);
    process.exit(0);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    process.stdout.write(String(value));
    process.exit(0);
  }
}
' "$json" "$paths_csv"
}

echo "[verify:local-provider] base_url=$BASE_URL"
echo "[verify:local-provider] submit_path=$SUBMIT_PATH"
echo "[verify:local-provider] status_path_template=$STATUS_PATH_TEMPLATE"

SUBMIT_URL="${BASE_URL}${SUBMIT_PATH}"
SUBMIT_BODY=$(cat <<JSON
{"sourceImageRef":"${SOURCE_IMAGE_REF}","prompt":"${PROMPT}","quality":"${QUALITY}","mode":"local"}
JSON
)

SUBMIT_OUT="$(mktemp)"
POLL_OUT="$(mktemp)"
trap 'rm -f "$SUBMIT_OUT" "$POLL_OUT"' EXIT

SUBMIT_CODE="$(curl_with_optional_auth -sS --max-time "$CURL_MAX_TIME" -o "$SUBMIT_OUT" -w '%{http_code}' \
  -X POST "$SUBMIT_URL" \
  -H 'Content-Type: application/json' \
  --data "$SUBMIT_BODY" || true)"

if [[ "$SUBMIT_CODE" -lt 200 || "$SUBMIT_CODE" -ge 300 ]]; then
  echo "[verify:local-provider] FAIL: submit status=$SUBMIT_CODE"
  cat "$SUBMIT_OUT" || true
  exit 1
fi

SUBMIT_JSON="$(cat "$SUBMIT_OUT")"
JOB_ID="$(json_pick_first "$SUBMIT_JSON" "$SUBMIT_JOB_ID_PATHS")"
if [[ -z "$JOB_ID" ]]; then
  echo "[verify:local-provider] FAIL: cannot extract job id"
  cat "$SUBMIT_OUT" || true
  exit 1
fi

echo "[verify:local-provider] submit ok, job_id=$JOB_ID"

attempt=1
while [[ "$attempt" -le "$POLL_MAX" ]]; do
  STATUS_PATH="${STATUS_PATH_TEMPLATE//\{jobId\}/$JOB_ID}"
  STATUS_URL="${BASE_URL}${STATUS_PATH}"

  POLL_CODE="$(curl_with_optional_auth -sS --max-time "$CURL_MAX_TIME" -o "$POLL_OUT" -w '%{http_code}' \
    -X GET "$STATUS_URL" \
    || true)"

  if [[ "$POLL_CODE" -lt 200 || "$POLL_CODE" -ge 300 ]]; then
    echo "[verify:local-provider] WARN: poll status=$POLL_CODE attempt=$attempt/$POLL_MAX"
    sleep "$POLL_DELAY"
    attempt=$((attempt + 1))
    continue
  fi

  POLL_JSON="$(cat "$POLL_OUT")"
  STATUS_RAW="$(json_pick_first "$POLL_JSON" "$POLL_STATUS_PATHS")"
  PROGRESS="$(json_pick_first "$POLL_JSON" "$POLL_PROGRESS_PATHS")"
  ERROR_MESSAGE="$(json_pick_first "$POLL_JSON" "$POLL_ERROR_MESSAGE_PATHS")"
  GLB_URL="$(json_pick_first "$POLL_JSON" "$POLL_GLB_URL_PATHS")"
  PREVIEW_URL="$(json_pick_first "$POLL_JSON" "$POLL_PREVIEW_URL_PATHS")"

  STATUS_LOWER="$(echo "$STATUS_RAW" | tr '[:upper:]' '[:lower:]')"
  echo "[verify:local-provider] poll attempt=$attempt status=${STATUS_LOWER:-unknown} progress=${PROGRESS:-n/a}"

  if [[ "$STATUS_LOWER" == "ready" || "$STATUS_LOWER" == "completed" || "$STATUS_LOWER" == "succeeded" || "$STATUS_LOWER" == "success" || "$STATUS_LOWER" == "done" ]]; then
    echo "[verify:local-provider] PASS"
    echo "- job_id: $JOB_ID"
    echo "- status: ${STATUS_LOWER}"
    echo "- glb_url: ${GLB_URL:-n/a}"
    echo "- preview_url: ${PREVIEW_URL:-n/a}"
    exit 0
  fi

  if [[ "$STATUS_LOWER" == "failed" || "$STATUS_LOWER" == "error" || "$STATUS_LOWER" == "canceled" || "$STATUS_LOWER" == "cancelled" ]]; then
    echo "[verify:local-provider] FAIL: provider status=$STATUS_LOWER"
    if [[ -n "$ERROR_MESSAGE" ]]; then
      echo "- error: $ERROR_MESSAGE"
    fi
    cat "$POLL_OUT" || true
    exit 1
  fi

  sleep "$POLL_DELAY"
  attempt=$((attempt + 1))
done

echo "[verify:local-provider] FAIL: timeout waiting for ready"
cat "$POLL_OUT" || true
exit 1
