#!/usr/bin/env bash
set -euo pipefail

WEB_BASE="${SNAPSPACE_WEB_BASE_URL:-http://localhost:3300}"
API_BASE="${SNAPSPACE_API_BASE_URL:-http://localhost:8080/api/v1}"
EMAIL="${SNAPSPACE_E2E_EMAIL:-ai-e2e-$(date +%s)@snapspace.local}"
NAME="${SNAPSPACE_E2E_NAME:-AI E2E Runner}"
POLL_MAX="${SNAPSPACE_E2E_POLL_MAX:-30}"
POLL_DELAY="${SNAPSPACE_E2E_POLL_DELAY:-2}"
CURL_MAX_TIME="${SNAPSPACE_E2E_CURL_MAX_TIME:-20}"

TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/cookies.txt"
PNG_FILE="$TMP_DIR/source.png"
RESP_FILE="$TMP_DIR/resp.json"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# 1x1 PNG
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z3xQAAAAASUVORK5CYII=' | base64 -d > "$PNG_FILE"

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

request_json_api() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS --max-time "$CURL_MAX_TIME" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H 'Content-Type: application/json' -X "$method" "$url" --data "$body" > "$RESP_FILE"
  else
    curl -sS --max-time "$CURL_MAX_TIME" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
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

echo "[ai-e2e] login via web proxy"
request_json "POST" "$WEB_BASE/api/auth/login" "{\"email\":\"$EMAIL\",\"name\":\"$NAME\"}"

echo "[ai-e2e] request bearer token via api login"
curl -sS --max-time "$CURL_MAX_TIME" -H 'Content-Type: application/json' \
  -X POST "$API_BASE/auth/login" --data "{\"email\":\"$EMAIL\",\"name\":\"$NAME\"}" > "$RESP_FILE"

ACCESS_TOKEN="$(json_get accessToken || true)"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "[ai-e2e] FAIL: access token missing"
  cat "$RESP_FILE"
  exit 1
fi

if ! grep -q 'snapspace_access_token' "$COOKIE_JAR"; then
  echo "[ai-e2e] FAIL: login cookie missing"
  cat "$RESP_FILE"
  exit 1
fi

echo "[ai-e2e] create project"
request_json "POST" "$WEB_BASE/api/projects" '{"name":"AI E2E Project","description":"local provider e2e"}'
PROJECT_ID="$(json_get id || true)"
if [[ -z "$PROJECT_ID" ]]; then
  echo "[ai-e2e] FAIL: project create failed"
  cat "$RESP_FILE"
  exit 1
fi

echo "[ai-e2e] create scene"
request_json "POST" "$WEB_BASE/api/projects/$PROJECT_ID/scenes" '{"name":"AI E2E Scene"}'
SCENE_ID="$(json_get id || true)"
if [[ -z "$SCENE_ID" ]]; then
  echo "[ai-e2e] FAIL: scene create failed"
  cat "$RESP_FILE"
  exit 1
fi

OBJECT_KEY="images/ai-source/$SCENE_ID/e2e-$(date +%s)-source.png"

echo "[ai-e2e] request upload url"
CONTENT_LENGTH="$(wc -c < "$PNG_FILE" | tr -d ' ')"
request_json "POST" "$WEB_BASE/api/assets/upload-url" "{\"objectKey\":\"$OBJECT_KEY\",\"contentType\":\"image/png\",\"contentLength\":$CONTENT_LENGTH}"
UPLOAD_URL="$(json_get uploadUrl || true)"
if [[ -z "$UPLOAD_URL" ]]; then
  echo "[ai-e2e] FAIL: upload url missing"
  cat "$RESP_FILE"
  exit 1
fi

echo "[ai-e2e] upload source image"
UPLOAD_CODE="$(curl -sS --max-time "$CURL_MAX_TIME" -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -X PUT "$WEB_BASE$UPLOAD_URL" -H 'Content-Type: image/png' --data-binary "@$PNG_FILE" || true)"
if [[ "$UPLOAD_CODE" -lt 200 || "$UPLOAD_CODE" -ge 300 ]]; then
  echo "[ai-e2e] FAIL: image upload failed status=$UPLOAD_CODE"
  exit 1
fi

echo "[ai-e2e] create ai generation"
request_json "POST" "$WEB_BASE/api/ai/generations" "{\"sceneId\":\"$SCENE_ID\",\"sourceImageAssetId\":\"$OBJECT_KEY\",\"prompt\":\"simple chair\",\"quality\":\"standard\"}"
GEN_ID="$(json_get id || true)"
if [[ -z "$GEN_ID" ]]; then
  echo "[ai-e2e] FAIL: generation create failed"
  cat "$RESP_FILE"
  exit 1
fi

echo "[ai-e2e] poll generation status"
attempt=1
while [[ "$attempt" -le "$POLL_MAX" ]]; do
  request_json "GET" "$WEB_BASE/api/ai/generations/$GEN_ID"
  STATUS="$(json_get status || true)"
  PROGRESS="$(json_get progress || true)"
  echo "[ai-e2e] poll $attempt/$POLL_MAX status=${STATUS:-unknown} progress=${PROGRESS:-n/a}"

  if [[ "$STATUS" == "ready" ]]; then
    break
  fi

  if [[ "$STATUS" == "failed" ]]; then
    echo "[ai-e2e] FAIL: generation status failed"
    cat "$RESP_FILE"
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep "$POLL_DELAY"
done

if [[ "$STATUS" != "ready" ]]; then
  echo "[ai-e2e] FAIL: generation did not reach ready"
  cat "$RESP_FILE"
  exit 1
fi

echo "[ai-e2e] promote generation to catalog"
request_json_api "POST" "$API_BASE/ai/generations/$GEN_ID/promote"
OBJECT_DEF_ID="$(json_get id || true)"
if [[ -z "$OBJECT_DEF_ID" ]]; then
  echo "[ai-e2e] FAIL: promote failed"
  cat "$RESP_FILE"
  exit 1
fi

echo "[ai-e2e] verify alias promote endpoint"
request_json_api "POST" "$API_BASE/object-definitions/from-generation/$GEN_ID"
OBJECT_DEF_ALIAS_ID="$(json_get id || true)"
if [[ -z "$OBJECT_DEF_ALIAS_ID" ]]; then
  echo "[ai-e2e] FAIL: alias promote failed"
  cat "$RESP_FILE"
  exit 1
fi

if [[ "$OBJECT_DEF_ALIAS_ID" != "$OBJECT_DEF_ID" ]]; then
  echo "[ai-e2e] FAIL: alias promote id mismatch ($OBJECT_DEF_ALIAS_ID != $OBJECT_DEF_ID)"
  exit 1
fi

echo "[ai-e2e] PASS"
echo "- project_id: $PROJECT_ID"
echo "- scene_id: $SCENE_ID"
echo "- generation_id: $GEN_ID"
echo "- object_definition_id: $OBJECT_DEF_ID"
echo "- object_definition_alias_id: $OBJECT_DEF_ALIAS_ID"
