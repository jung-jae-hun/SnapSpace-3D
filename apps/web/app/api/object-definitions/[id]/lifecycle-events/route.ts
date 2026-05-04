import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../../lib/backend';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const limit = request.nextUrl.searchParams.get('limit');
  const suffix = limit ? `?limit=${encodeURIComponent(limit)}` : '';

  const response = await fetch(backendUrl(`/object-definitions/${id}/lifecycle-events${suffix}`), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
