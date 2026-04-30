import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../lib/backend';

function rewriteUploadUrlForBrowser(rawUrl?: string) {
  if (!rawUrl) {
    return rawUrl;
  }

  try {
    const encodedTarget = encodeURIComponent(rawUrl);
    return `/api/assets/upload-proxy?target=${encodedTarget}`;
  } catch {
    return rawUrl;
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    objectKey?: string;
    contentType?: string;
  };

  const response = await fetch(backendUrl('/assets/upload-url'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      objectKey: body.objectKey,
      contentType: body.contentType ?? 'application/octet-stream'
    })
  });

  const data = (await response.json()) as {
    uploadUrl?: string;
    [key: string]: unknown;
  };

  data.uploadUrl = rewriteUploadUrlForBrowser(data.uploadUrl);
  return NextResponse.json(data, { status: response.status });
}
