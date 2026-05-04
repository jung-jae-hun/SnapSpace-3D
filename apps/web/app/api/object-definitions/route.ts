import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { backendUrl } from '../../../lib/backend';
import { forwardProxyJson, proxyRequestFailed } from '../../../lib/proxy-response';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const query = request.nextUrl.searchParams.toString();
    const path = query ? `/object-definitions?${query}` : '/object-definitions';
    const response = await fetch(backendUrl(path), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: 'no-store'
    });

    return await forwardProxyJson(response);
  } catch (error) {
    return proxyRequestFailed(error, '/object-definitions');
  }
}
