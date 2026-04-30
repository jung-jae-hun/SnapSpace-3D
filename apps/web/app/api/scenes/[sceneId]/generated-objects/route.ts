import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../../lib/backend';
import { forwardProxyJson, proxyRequestFailed } from '../../../../../lib/proxy-response';

type RouteContext = {
  params: Promise<{ sceneId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { sceneId } = await context.params;

  try {
    const response = await fetch(backendUrl(`/scenes/${sceneId}/generated-objects`), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: 'no-store'
    });

    return await forwardProxyJson(response);
  } catch (error) {
    return proxyRequestFailed(error, `/scenes/${sceneId}/generated-objects`);
  }
}
