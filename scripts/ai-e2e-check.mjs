const API = 'http://localhost:8081/api/v1';

async function req(path, init = {}) {
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { res, json };
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

async function main() {
  const login = await req('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@snapspace.io', name: 'Snap Owner' })
  });
  assert(login.res.ok, `login failed: ${login.res.status} ${JSON.stringify(login.json)}`);

  const token = login.json.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  const projects = await req('/projects', { headers: auth });
  assert(projects.res.ok, `projects failed: ${projects.res.status}`);

  let projectId = projects.json?.[0]?.id;
  if (!projectId) {
    const created = await req('/projects', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'AI E2E Project' })
    });
    assert(
      created.res.ok,
      `create project failed: ${created.res.status} ${JSON.stringify(created.json)}`
    );
    projectId = created.json.id;
  }

  const scenes = await req(`/projects/${projectId}/scenes`, { headers: auth });
  assert(scenes.res.ok, `list scenes failed: ${scenes.res.status}`);

  let sceneId = scenes.json?.[0]?.id;
  if (!sceneId) {
    const createdScene = await req(`/projects/${projectId}/scenes`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'AI E2E Scene' })
    });
    assert(
      createdScene.res.ok,
      `create scene failed: ${createdScene.res.status} ${JSON.stringify(createdScene.json)}`
    );
    sceneId = createdScene.json.id;
  }

  const objectKey = `images/ai-source/${sceneId}/${Date.now()}-e2e.jpeg`;
  const uploadTicket = await req('/assets/upload-url', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ objectKey, contentType: 'image/jpeg' })
  });
  assert(
    uploadTicket.res.ok,
    `upload-url failed: ${uploadTicket.res.status} ${JSON.stringify(uploadTicket.json)}`
  );

  const putRes = await fetch(uploadTicket.json.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: Buffer.from('JPEG-E2E')
  });
  assert(putRes.ok, `put failed: ${putRes.status}`);

  const createdJob = await req('/ai/generations', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ sceneId, sourceImageAssetId: objectKey, quality: 'standard' })
  });
  assert(
    createdJob.res.ok,
    `create generation failed: ${createdJob.res.status} ${JSON.stringify(createdJob.json)}`
  );

  const generationId = createdJob.json.id;
  let last = createdJob.json;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < 20; i += 1) {
    const polled = await req(`/ai/generations/${generationId}`, { headers: auth });
    assert(polled.res.ok, `poll failed: ${polled.res.status} ${JSON.stringify(polled.json)}`);
    last = polled.json;
    if (last.status === 'ready' || last.status === 'failed') {
      break;
    }
    await sleep(1500);
  }

  assert(last.status === 'ready', `generation not ready: ${last.status} ${JSON.stringify(last)}`);

  const promoted = await req(`/ai/generations/${generationId}/promote`, {
    method: 'POST',
    headers: auth
  });
  assert(
    promoted.res.ok,
    `promote failed: ${promoted.res.status} ${JSON.stringify(promoted.json)}`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        sceneId,
        generationId,
        status: last.status,
        progress: last.progress,
        glbAssetId: last.generatedAsset?.glbAssetId,
        promotedObjectId: promoted.json?.id,
        promotedObjectName: promoted.json?.name
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('[E2E FAILED]', err.message);
  process.exit(1);
});
