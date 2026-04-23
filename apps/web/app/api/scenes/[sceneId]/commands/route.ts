import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../../lib/backend';

type RouteContext = {
  params: Promise<{ sceneId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { sceneId } = await context.params;
  const limit = request.nextUrl.searchParams.get('limit');
  const status = request.nextUrl.searchParams.get('status');
  const action = request.nextUrl.searchParams.get('action');
  const params = new URLSearchParams();
  if (limit) {
    params.set('limit', limit);
  }
  if (status) {
    params.set('status', status);
  }
  if (action) {
    params.set('action', action);
  }
  const query = params.size > 0 ? `?${params.toString()}` : '';

  const response = await fetch(backendUrl(`/scenes/${sceneId}/commands${query}`), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    commandId?: string;
    action?: 'rename' | 'archive' | 'restore';
    expectedVersion?: number;
    payload?: { name?: string };
  };

  if (!body.commandId || !body.action || !body.expectedVersion) {
    return NextResponse.json(
      { message: 'commandId, action, expectedVersion are required' },
      { status: 400 }
    );
  }

  const { sceneId } = await context.params;

  const response = await fetch(backendUrl(`/scenes/${sceneId}/commands`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
