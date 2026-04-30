import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../../lib/backend';
import { forwardProxyJson, proxyRequestFailed } from '../../../../../lib/proxy-response';

type RouteContext = {
  params: Promise<{ sceneId: string }>;
};

async function readAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get('snapspace_access_token')?.value;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const accessToken = await readAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { sceneId } = await context.params;

  try {
    const response = await fetch(backendUrl(`/scenes/${sceneId}/placed-objects`), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: 'no-store'
    });

    return await forwardProxyJson(response);
  } catch (error) {
    return proxyRequestFailed(error, `/scenes/${sceneId}/placed-objects`);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const accessToken = await readAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    objectDefinitionId?: string;
    name?: string;
    position?: Record<string, unknown>;
    rotationY?: number;
    scale?: Record<string, unknown>;
    params?: Record<string, unknown>;
  };

  if (!body.objectDefinitionId || !body.position || !body.scale) {
    return NextResponse.json(
      { message: 'objectDefinitionId, position, scale are required' },
      { status: 400 }
    );
  }

  const { sceneId } = await context.params;

  try {
    const response = await fetch(backendUrl(`/scenes/${sceneId}/placed-objects`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    return await forwardProxyJson(response);
  } catch (error) {
    return proxyRequestFailed(error, `/scenes/${sceneId}/placed-objects`);
  }
}
