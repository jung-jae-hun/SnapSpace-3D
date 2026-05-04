const WEB = (process.env.SNAPSPACE_WEB_BASE_URL ?? 'http://localhost:3300').replace(/\/$/, '');
const POLL_MAX = Number(process.env.SNAPSPACE_E2E_POLL_MAX ?? '30');
const POLL_DELAY_MS = Number(process.env.SNAPSPACE_E2E_POLL_DELAY_MS ?? '1500');

async function req(path, init = {}) {
  const res = await fetch(`${WEB}${path}`, init);
  const text = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  let json;

  if (contentType.includes('application/json')) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
  } else {
    json = { message: text };
  }

  return { res, json, text, contentType };
}

function extractCookie(setCookie) {
  if (!setCookie) {
    return null;
  }

  const token = setCookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('snapspace_access_token='));

  return token ?? null;
}

function assert(cond, message) {
  if (!cond) {
    throw new Error(message);
  }
}

async function createGeneration(cookieHeader, suffix) {
  const project = await req('/api/projects', {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Route Verify Project ${suffix}` })
  });
  assert(project.res.ok, `project create failed: ${project.res.status} ${JSON.stringify(project.json)}`);

  const scene = await req(`/api/projects/${project.json.id}/scenes`, {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Route Verify Scene ${suffix}` })
  });
  assert(scene.res.ok, `scene create failed: ${scene.res.status} ${JSON.stringify(scene.json)}`);

  const imageBytes = Buffer.from('PNG-E2E');
  const objectKey = `images/ai-source/${scene.json.id}/${Date.now()}-${suffix}.png`;
  const uploadTicket = await req('/api/assets/upload-url', {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      objectKey,
      contentType: 'image/png',
      contentLength: imageBytes.length
    })
  });
  assert(
    uploadTicket.res.ok,
    `upload-url failed: ${uploadTicket.res.status} ${JSON.stringify(uploadTicket.json)}`
  );

  const put = await fetch(`${WEB}${uploadTicket.json.uploadUrl}`, {
    method: 'PUT',
    headers: { Cookie: cookieHeader, 'content-type': 'image/png' },
    body: imageBytes
  });
  assert(put.ok, `asset upload failed: ${put.status}`);

  const generation = await req('/api/ai/generations', {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      sceneId: scene.json.id,
      sourceImageAssetId: objectKey,
      prompt: 'route regression',
      quality: 'standard'
    })
  });
  assert(
    generation.res.ok,
    `generation create failed: ${generation.res.status} ${JSON.stringify(generation.json)}`
  );

  return generation.json.id;
}

async function waitUntilReady(generationId, cookieHeader) {
  for (let i = 0; i < POLL_MAX; i += 1) {
    const polled = await req(`/api/ai/generations/${generationId}`, {
      headers: { Cookie: cookieHeader }
    });
    assert(polled.res.ok, `poll failed: ${polled.res.status} ${JSON.stringify(polled.json)}`);

    if (polled.json.status === 'ready') {
      return polled.json;
    }

    if (polled.json.status === 'failed') {
      throw new Error(`generation failed: ${JSON.stringify(polled.json)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }

  throw new Error(`generation not ready within timeout: ${generationId}`);
}

async function main() {
  const email = `route-verify-${Date.now()}@snapspace.local`;
  const login = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: 'Route Verifier' })
  });
  assert(login.res.ok, `login failed: ${login.res.status} ${JSON.stringify(login.json)}`);

  const setCookie = login.res.headers.get('set-cookie');
  const cookieHeader = extractCookie(setCookie);
  assert(Boolean(cookieHeader), 'login cookie missing');

  const unauthorizedGet = await req('/api/ai/generations/dummy-id');
  assert(unauthorizedGet.res.status === 401, `unauthorized GET expected 401, got ${unauthorizedGet.res.status}`);

  const unauthorizedPromote = await req('/api/ai/generations/dummy-id/promote', { method: 'POST' });
  assert(
    unauthorizedPromote.res.status === 401,
    `unauthorized promote expected 401, got ${unauthorizedPromote.res.status}`
  );

  const unauthorizedCancel = await req('/api/ai/generations/dummy-id/cancel', { method: 'POST' });
  assert(
    unauthorizedCancel.res.status === 401,
    `unauthorized cancel expected 401, got ${unauthorizedCancel.res.status}`
  );

  const invalidAction = await req('/api/ai/generations/dummy-id/invalid', {
    method: 'POST',
    headers: { Cookie: cookieHeader }
  });
  assert(invalidAction.res.status === 404, `invalid action expected 404, got ${invalidAction.res.status}`);

  const generationForCancel = await createGeneration(cookieHeader, 'cancel');
  const cancel = await req(`/api/ai/generations/${generationForCancel}/cancel`, {
    method: 'POST',
    headers: { Cookie: cookieHeader }
  });
  assert(cancel.res.ok, `cancel failed: ${cancel.res.status} ${JSON.stringify(cancel.json)}`);

  const generationForPromote = await createGeneration(cookieHeader, 'promote');

  const getGeneration = await req(`/api/ai/generations/${generationForPromote}`, {
    headers: { Cookie: cookieHeader }
  });
  assert(getGeneration.res.ok, `generation GET failed: ${getGeneration.res.status} ${JSON.stringify(getGeneration.json)}`);
  assert(getGeneration.json.id === generationForPromote, 'generation GET id mismatch');

  await waitUntilReady(generationForPromote, cookieHeader);

  const promote = await req(`/api/ai/generations/${generationForPromote}/promote`, {
    method: 'POST',
    headers: { Cookie: cookieHeader }
  });
  assert(promote.res.ok, `promote failed: ${promote.res.status} ${JSON.stringify(promote.json)}`);
  assert(Boolean(promote.json?.id), 'promote response missing object definition id');

  console.log(
    JSON.stringify(
      {
        ok: true,
        generationForCancel,
        generationForPromote,
        promotedObjectDefinitionId: promote.json.id,
        checks: {
          unauthorizedGet: unauthorizedGet.res.status,
          unauthorizedPromote: unauthorizedPromote.res.status,
          unauthorizedCancel: unauthorizedCancel.res.status,
          invalidAction: invalidAction.res.status
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[verify-web-ai-generation-routes] FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
