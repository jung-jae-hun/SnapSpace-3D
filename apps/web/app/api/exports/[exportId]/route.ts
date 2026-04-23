import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../lib/backend';

type RouteContext = {
  params: Promise<{ exportId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { exportId } = await context.params;

  const response = await fetch(backendUrl(`/exports/${exportId}`), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
