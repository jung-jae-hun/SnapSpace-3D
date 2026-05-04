#!/usr/bin/env python3
import json
import os
import time
import uuid
from urllib import error, request
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = os.environ.get("OPENSRC_PROVIDER_HOST", "0.0.0.0")
PORT = int(os.environ.get("OPENSRC_PROVIDER_PORT", "7002"))
READY_MS = int(os.environ.get("OPENSRC_PROVIDER_READY_MS", "8000"))
ENGINE_MODE = os.environ.get("OPENSRC_ENGINE_MODE", "stub").strip().lower()
ENGINE_BASE_URL = os.environ.get("OPENSRC_ENGINE_BASE_URL", "").strip().rstrip("/")
ENGINE_SUBMIT_PATH = os.environ.get("OPENSRC_ENGINE_SUBMIT_PATH", "/v1/image-to-3d/jobs")
ENGINE_STATUS_PATH = os.environ.get("OPENSRC_ENGINE_STATUS_PATH", "/v1/image-to-3d/jobs/{jobId}")
ENGINE_API_KEY = os.environ.get("OPENSRC_ENGINE_API_KEY", "").strip()
ENGINE_TIMEOUT_SEC = float(os.environ.get("OPENSRC_ENGINE_TIMEOUT_SEC", "20"))

jobs = {}


def _should_proxy() -> bool:
    return ENGINE_MODE == "proxy" and len(ENGINE_BASE_URL) > 0


def _proxy_headers(content_type: str | None = None) -> dict:
    headers: dict[str, str] = {}
    if content_type:
        headers["Content-Type"] = content_type
    if ENGINE_API_KEY:
        headers["Authorization"] = f"Bearer {ENGINE_API_KEY}"
    return headers


def _proxy_call(method: str, path: str, body: bytes | None = None):
    url = f"{ENGINE_BASE_URL}{path}"
    req = request.Request(url=url, data=body, method=method)
    for key, value in _proxy_headers("application/json" if body is not None else None).items():
        req.add_header(key, value)

    try:
        with request.urlopen(req, timeout=ENGINE_TIMEOUT_SEC) as resp:
            raw = resp.read().decode("utf-8") if resp.length != 0 else "{}"
            payload = json.loads(raw) if raw else {}
            return resp.status, payload
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8") if exc.fp else ""
        payload = None
        if raw:
            try:
                payload = json.loads(raw)
            except Exception:
                payload = None
        if isinstance(payload, dict):
            return exc.code, payload
        return exc.code, {"errorCode": "engine_http_error", "errorMessage": raw or "engine http error"}
    except Exception as exc:
        return 502, {"errorCode": "engine_unreachable", "errorMessage": str(exc)}


def _json(handler: BaseHTTPRequestHandler, status: int, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            return _json(
                self,
                200,
                {
                    "ok": True,
                    "service": "local-provider-opensrc-adapter",
                    "mode": "proxy" if _should_proxy() else "stub",
                    "engineBaseUrl": ENGINE_BASE_URL or None,
                },
            )

        if self.path.startswith("/v1/image-to-3d/jobs/"):
            if _should_proxy():
                status, payload = _proxy_call("GET", self.path)
                return _json(self, status, payload)

            job_id = self.path.split("/")[-1]
            job = jobs.get(job_id)
            if not job:
                return _json(self, 404, {"errorCode": "not_found", "errorMessage": "job not found"})

            elapsed_ms = int((time.time() - job["created_at"]) * 1000)
            if elapsed_ms < int(READY_MS * 0.4):
                return _json(self, 200, {"status": "running", "progress": 24})
            if elapsed_ms < READY_MS:
                return _json(self, 200, {"status": "post_processing", "progress": 76})

            return _json(
                self,
                200,
                {
                    "status": "ready",
                    "progress": 100,
                    "output": {
                        "glbAssetId": f"generated/ai/opensrc-{job_id}/model.glb",
                        "objAssetId": f"generated/ai/opensrc-{job_id}/model.obj",
                        "previewImageAssetId": f"generated/ai/opensrc-{job_id}/preview.png",
                        "bounds": {"x": 1.05, "y": 1.2, "z": 0.95},
                    },
                },
            )

        return _json(self, 404, {"errorCode": "not_found", "errorMessage": "endpoint not found"})

    def do_POST(self):
        if self.path == "/v1/image-to-3d/jobs":
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length) if length > 0 else b"{}"

            if _should_proxy():
                status, payload = _proxy_call("POST", self.path, body)
                return _json(self, status, payload)

            job_id = str(uuid.uuid4())
            jobs[job_id] = {"created_at": time.time()}
            return _json(self, 201, {"jobId": job_id, "status": "queued"})

        return _json(self, 404, {"errorCode": "not_found", "errorMessage": "endpoint not found"})

    def log_message(self, format: str, *args):
        return


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    mode = "proxy" if _should_proxy() else "stub"
    print(f"[local-provider-opensrc] listening on http://{HOST}:{PORT} (mode={mode})")
    server.serve_forever()
