import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { backendUrl } from '../../../lib/backend';
import { forwardProxyJson, proxyRequestFailed } from '../../../lib/proxy-response';

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(backendUrl('/object-definitions'), {
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
