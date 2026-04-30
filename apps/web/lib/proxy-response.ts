import { NextResponse } from 'next/server';

export async function forwardProxyJson(response: Response): Promise<NextResponse> {
  const contentType = response.headers.get('content-type') ?? '';
  const bodyText = await response.text();

  if (!bodyText) {
    return new NextResponse(null, { status: response.status });
  }

  if (contentType.includes('application/json')) {
    try {
      return NextResponse.json(JSON.parse(bodyText), { status: response.status });
    } catch {
      return NextResponse.json(
        { message: 'Invalid JSON response from upstream server' },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { message: bodyText.slice(0, 1000) },
    { status: response.status }
  );
}

export function proxyRequestFailed(error: unknown, upstreamPath: string): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown proxy error';
  return NextResponse.json(
    { message: `Proxy request failed for ${upstreamPath}: ${message}` },
    { status: 502 }
  );
}