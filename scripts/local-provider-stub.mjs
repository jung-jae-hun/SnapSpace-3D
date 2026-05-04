#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.LOCAL_PROVIDER_STUB_PORT || '7001');
const host = process.env.LOCAL_PROVIDER_STUB_HOST || '127.0.0.1';
const readyMs = Number(process.env.LOCAL_PROVIDER_STUB_READY_MS || '5000');

const jobs = new Map();

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://${host}:${port}`);

  if (method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'local-provider-stub' });
  }

  if (method === 'POST' && url.pathname === '/v1/image-to-3d/jobs') {
    try {
      const body = await parseBody(req);
      const jobId = randomUUID();
      jobs.set(jobId, {
        createdAt: Date.now(),
        prompt: typeof body.prompt === 'string' ? body.prompt : '',
        sourceImageRef:
          typeof body.sourceImageRef === 'string' ? body.sourceImageRef : 'generated/ai/stub/source.png',
        quality: body.quality === 'standard' ? 'standard' : 'low'
      });

      return sendJson(res, 201, {
        jobId,
        status: 'queued'
      });
    } catch {
      return sendJson(res, 400, { errorCode: 'bad_request', errorMessage: 'invalid json body' });
    }
  }

  const match = url.pathname.match(/^\/v1\/image-to-3d\/jobs\/([a-zA-Z0-9-]+)$/);
  if (method === 'GET' && match) {
    const jobId = match[1];
    const job = jobs.get(jobId);

    if (!job) {
      return sendJson(res, 404, { errorCode: 'not_found', errorMessage: 'job not found' });
    }

    const elapsed = Date.now() - job.createdAt;
    if (elapsed < readyMs * 0.35) {
      return sendJson(res, 200, {
        status: 'running',
        progress: 28
      });
    }

    if (elapsed < readyMs) {
      return sendJson(res, 200, {
        status: 'post_processing',
        progress: 82
      });
    }

    return sendJson(res, 200, {
      status: 'ready',
      progress: 100,
      output: {
        glbAssetId: `generated/ai/local-${jobId}/model.glb`,
        objAssetId: `generated/ai/local-${jobId}/model.obj`,
        previewImageAssetId: `generated/ai/local-${jobId}/preview.png`,
        bounds: job.quality === 'standard' ? { x: 1.2, y: 1.35, z: 1.1 } : { x: 0.8, y: 0.9, z: 0.8 }
      }
    });
  }

  return sendJson(res, 404, { errorCode: 'not_found', errorMessage: 'endpoint not found' });
});

server.listen(port, host, () => {
  console.log(`[local-provider-stub] listening on http://${host}:${port}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
