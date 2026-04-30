import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_UPLOAD_HOSTS = new Set([
  'minio',
  'localhost',
  '127.0.0.1',
  'host.docker.internal'
]);

function parseTargetUrl(target: string | null) {
  if (!target) {
    return null;
  }

  try {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    if (!ALLOWED_UPLOAD_HOSTS.has(parsed.hostname)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const target = request.nextUrl.searchParams.get('target');
  const parsedTarget = parseTargetUrl(target);
  if (!parsedTarget) {
    return NextResponse.json({ message: 'Invalid upload target' }, { status: 400 });
  }

  const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
  const body = await request.arrayBuffer();

  const upstream = await fetch(parsedTarget.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType
    },
    body
  });

  const upstreamBody = await upstream.arrayBuffer();
  return new NextResponse(upstreamBody, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream'
    }
  });
}
