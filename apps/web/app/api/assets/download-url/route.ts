import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../lib/backend';

function rewriteDownloadUrlForBrowser(rawUrl?: string) {
  if (!rawUrl) {
    return rawUrl;
  }

  try {
    const encodedTarget = encodeURIComponent(rawUrl);
    return `/api/assets/object-proxy?target=${encodedTarget}`;
  } catch {
    return rawUrl;
  }
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const objectKey = request.nextUrl.searchParams.get('objectKey');
  if (!objectKey) {
    return NextResponse.json({ message: 'objectKey is required' }, { status: 400 });
  }

  const response = await fetch(
    `${backendUrl('/assets/download-url')}?objectKey=${encodeURIComponent(objectKey)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: 'no-store'
    }
  );

  const data = (await response.json().catch(() => ({}))) as {
    downloadUrl?: string;
    [key: string]: unknown;
  };

  data.downloadUrl = rewriteDownloadUrlForBrowser(data.downloadUrl);
  return NextResponse.json(data, { status: response.status });
}
