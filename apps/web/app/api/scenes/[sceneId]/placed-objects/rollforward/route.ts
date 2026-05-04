import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../../../lib/backend';

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
    fromObjectDefinitionId?: string;
    toObjectDefinitionId?: string;
  };

  if (!body.fromObjectDefinitionId || !body.toObjectDefinitionId) {
    return NextResponse.json(
      { message: 'fromObjectDefinitionId and toObjectDefinitionId are required' },
      { status: 400 }
    );
  }

  const { sceneId } = await context.params;

  const response = await fetch(backendUrl(`/scenes/${sceneId}/placed-objects/rollforward`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fromObjectDefinitionId: body.fromObjectDefinitionId,
      toObjectDefinitionId: body.toObjectDefinitionId
    })
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
