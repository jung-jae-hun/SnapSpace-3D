import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../../lib/backend';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const response = await fetch(backendUrl(`/object-definitions/${id}/new-version`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
