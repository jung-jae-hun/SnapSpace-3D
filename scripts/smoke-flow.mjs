#!/usr/bin/env node

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const API_BASE = (process.env.SNAPSPACE_API_BASE_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '');
const EMAIL = process.env.SNAPSPACE_SMOKE_EMAIL ?? `smoke-${Date.now()}@snapspace.local`;
const NAME = process.env.SNAPSPACE_SMOKE_NAME ?? 'Smoke Runner';
const EXPORT_TIMEOUT_MS = Number(process.env.SNAPSPACE_SMOKE_EXPORT_TIMEOUT_MS ?? 120000);
const POLL_INTERVAL_MS = Number(process.env.SNAPSPACE_SMOKE_POLL_MS ?? 1500);
const OUTPUT_DIR = process.env.SNAPSPACE_SMOKE_OUTPUT_DIR ?? path.resolve(process.cwd(), '.tmp', 'smoke');

function now() {
  return new Date().toISOString();
}

function log(step, message) {
  console.log(`[${now()}] [${step}] ${message}`);
}

async function request(method, endpoint, token, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Network error ${method} ${endpoint} @ ${API_BASE}: ${reason}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.arrayBuffer();

  if (!response.ok) {
    const detail = isJson ? JSON.stringify(payload) : `binary(${payload.byteLength})`;
    throw new Error(`${method} ${endpoint} failed: ${response.status} ${detail}`);
  }

  return payload;
}

async function preflight() {
  try {
    await fetch(`${API_BASE}/auth/login`, { method: 'OPTIONS' });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`API 연결 실패: ${API_BASE} (${reason}). API/DB/Redis/Worker를 먼저 실행하세요.`);
  }
}

async function pollExportStatus(token, exportId) {
  const start = Date.now();

  while (Date.now() - start < EXPORT_TIMEOUT_MS) {
    const item = await request('GET', `/exports/${exportId}`, token);

    if (item.status === 'succeeded' || item.status === 'failed') {
      return item;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Export polling timeout: ${EXPORT_TIMEOUT_MS}ms`);
}

async function main() {
  const suffix = String(Date.now());

  await preflight();

  log('login', `user=${EMAIL}`);
  const login = await request('POST', '/auth/login', undefined, { email: EMAIL, name: NAME });
  const token = login.accessToken;
  if (!token) {
    throw new Error('No accessToken from login');
  }

  log('project', 'create project');
  const project = await request('POST', '/projects', token, {
    name: `Smoke Project ${suffix}`,
    description: '자동 스모크 검증용 프로젝트'
  });

  log('scene', 'create scene');
  const scene = await request('POST', `/projects/${project.id}/scenes`, token, {
    name: `Smoke Scene ${suffix}`
  });

  log('object-definition', 'create object definition');
  const objectDefinition = await request('POST', '/object-definitions', token, {
    code: `smoke_cube_${suffix}`,
    name: `Smoke Cube ${suffix}`,
    category: 'smoke',
    tags: ['smoke', 'cube'],
    defaultSize: { width: 1, depth: 1, height: 1 },
    pivot: 'bottom-center',
    allowedRotations: [0, 90, 180, 270],
    scalable: { x: true, y: true, z: true }
  });

  log('placement', 'bulk replace placed objects');
  await request('POST', `/scenes/${scene.id}/placed-objects/bulk`, token, {
    mode: 'replace',
    items: [
      {
        objectDefinitionId: objectDefinition.id,
        name: 'A',
        position: { x: -2, y: 0, z: 0 },
        rotationY: 0,
        scale: { x: 1, y: 1, z: 1 }
      },
      {
        objectDefinitionId: objectDefinition.id,
        name: 'B',
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        scale: { x: 1.2, y: 1, z: 1 }
      },
      {
        objectDefinitionId: objectDefinition.id,
        name: 'C',
        position: { x: 3, y: 0, z: 1 },
        rotationY: 0,
        scale: { x: 0.8, y: 1, z: 1 }
      }
    ]
  });

  log('arrange', 'run align-x');
  await request('POST', `/scenes/${scene.id}/arrange`, token, {
    action: 'align-x'
  });

  log('generate', 'run generate');
  const generated = await request('POST', `/scenes/${scene.id}/generate`, token, {});
  if (!generated.generatedCount || generated.generatedCount < 1) {
    throw new Error('Generated objects count is zero');
  }

  log('export', 'create export job');
  const exportJob = await request('POST', `/scenes/${scene.id}/exports`, token, { format: 'glb' });

  log('export', `poll export status exportId=${exportJob.id}`);
  const exportStatus = await pollExportStatus(token, exportJob.id);
  if (exportStatus.status !== 'succeeded') {
    throw new Error(`Export failed: ${exportStatus.lastError ?? 'unknown error'}`);
  }

  log('download', 'download glb file');
  const download = await request('GET', `/exports/${exportJob.id}/download`, token);
  const bytes = Buffer.from(download);
  if (bytes.length < 20) {
    throw new Error(`Downloaded file is too small: ${bytes.length}`);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `scene-${exportJob.id}.glb`);
  await writeFile(outputPath, bytes);

  log('success', `flow completed. output=${outputPath} bytes=${bytes.length}`);
}

main().catch((error) => {
  console.error(`[${now()}] [error] ${error.message}`);
  process.exitCode = 1;
});
