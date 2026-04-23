import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../../lib/backend';

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

  const response = await fetch(backendUrl(`/scenes/${sceneId}/exports`), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const accessToken = await readAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    format?: 'glb';
  };

  const { sceneId } = await context.params;

  const response = await fetch(backendUrl(`/scenes/${sceneId}/exports`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ format: body.format ?? 'glb' })
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
