#!/usr/bin/env node

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const API_BASE = (process.env.SNAPSPACE_API_BASE_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '');
const EMAIL = process.env.SNAPSPACE_SMOKE_EMAIL ?? `smoke-lifecycle-${Date.now()}@snapspace.local`;
const NAME = process.env.SNAPSPACE_SMOKE_NAME ?? 'Smoke Lifecycle Runner';
const OUTPUT_DIR = process.env.SNAPSPACE_SMOKE_OUTPUT_DIR ?? path.resolve(process.cwd(), '.tmp', 'smoke-lifecycle');

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
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = isJson ? JSON.stringify(payload) : String(payload);
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
    name: `Smoke Lifecycle Project ${suffix}`,
    description: '라이프사이클/롤포워드 스모크 검증용 프로젝트'
  });

  log('scene', 'create scene');
  const scene = await request('POST', `/projects/${project.id}/scenes`, token, {
    name: `Smoke Lifecycle Scene ${suffix}`
  });

  log('object-definition', 'create v1 object definition');
  const objectV1 = await request('POST', '/object-definitions', token, {
    code: `smoke_lifecycle_cube_${suffix}`,
    name: `Lifecycle Cube ${suffix}`,
    category: 'smoke-lifecycle',
    tags: ['smoke', 'lifecycle'],
    defaultSize: { width: 1, depth: 1, height: 1 },
    pivot: 'bottom-center',
    allowedRotations: [0, 90, 180, 270],
    scalable: { x: true, y: true, z: true }
  });

  log('placement', 'bulk replace placed objects with v1');
  await request('POST', `/scenes/${scene.id}/placed-objects/bulk`, token, {
    mode: 'replace',
    items: [
      {
        objectDefinitionId: objectV1.id,
        name: 'L1',
        position: { x: -1, y: 0, z: 0 },
        rotationY: 0,
        scale: { x: 1, y: 1, z: 1 }
      },
      {
        objectDefinitionId: objectV1.id,
        name: 'L2',
        position: { x: 2, y: 0, z: 1 },
        rotationY: 0,
        scale: { x: 1, y: 1, z: 1 }
      }
    ]
  });

  log('lifecycle', 'create new version (v2)');
  const versionResult = await request('POST', `/object-definitions/${objectV1.id}/new-version`, token);
  const objectV2 = versionResult.created;
  if (!objectV2?.id) {
    throw new Error('new-version response missing created object');
  }

  log('rollforward', 'replace scene placements v1 -> v2');
  const rollforward = await request('POST', `/scenes/${scene.id}/placed-objects/rollforward`, token, {
    fromObjectDefinitionId: objectV1.id,
    toObjectDefinitionId: objectV2.id
  });

  if (!Number.isFinite(rollforward.replacedCount) || rollforward.replacedCount < 2) {
    throw new Error(`Expected replacedCount >= 2, got ${rollforward.replacedCount}`);
  }

  log('verify', 'check placed objects use v2');
  const placed = await request('GET', `/scenes/${scene.id}/placed-objects`, token);
  if (!Array.isArray(placed) || placed.length < 2) {
    throw new Error('Placed object list is empty or invalid');
  }

  const hasOld = placed.some((item) => item.objectDefinitionId === objectV1.id);
  if (hasOld) {
    throw new Error('Rollforward failed: old objectDefinitionId still exists in scene placements');
  }

  const hasNew = placed.some((item) => item.objectDefinitionId === objectV2.id);
  if (!hasNew) {
    throw new Error('Rollforward failed: no placements with new objectDefinitionId');
  }

  log('events', 'fetch lifecycle events for v1 and v2');
  const v1Events = await request('GET', `/object-definitions/${objectV1.id}/lifecycle-events?limit=20`, token);
  const v2Events = await request('GET', `/object-definitions/${objectV2.id}/lifecycle-events?limit=20`, token);

  if (!Array.isArray(v1Events) || !Array.isArray(v2Events)) {
    throw new Error('Lifecycle event responses are invalid');
  }

  const v1HasDeactivate = v1Events.some((event) => event.action === 'deactivate');
  if (!v1HasDeactivate) {
    throw new Error('Expected v1 lifecycle events to include deactivate');
  }

  const v2HasNewVersion = v2Events.some((event) => event.action === 'new_version');
  if (!v2HasNewVersion) {
    throw new Error('Expected v2 lifecycle events to include new_version');
  }

  const report = {
    apiBase: API_BASE,
    projectId: project.id,
    sceneId: scene.id,
    objectV1Id: objectV1.id,
    objectV2Id: objectV2.id,
    replacedCount: rollforward.replacedCount,
    placedCount: placed.length,
    checks: {
      noOldObjectInScene: !hasOld,
      hasNewObjectInScene: hasNew,
      v1HasDeactivate,
      v2HasNewVersion
    },
    generatedAt: now()
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `lifecycle-${scene.id}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  log('success', `lifecycle flow completed. report=${outputPath}`);
}

main().catch((error) => {
  console.error(`[${now()}] [error] ${error.message}`);
  process.exitCode = 1;
});
