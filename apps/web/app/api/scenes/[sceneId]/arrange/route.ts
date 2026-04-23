import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../../lib/backend';

type RouteContext = {
  params: Promise<{ sceneId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: 'align-x' | 'align-z' | 'space-x' | 'snap-grid';
    objectIds?: string[];
    gridSize?: number;
  };

  if (!body.action) {
    return NextResponse.json({ message: 'action is required' }, { status: 400 });
  }

  const { sceneId } = await context.params;

  const response = await fetch(backendUrl(`/scenes/${sceneId}/arrange`), {
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
