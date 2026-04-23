import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../lib/backend';

async function readAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get('snapspace_access_token')?.value;
}

export async function GET() {
  const accessToken = await readAccessToken();

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(backendUrl('/projects'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: NextRequest) {
  const accessToken = await readAccessToken();

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
  };

  if (!body.name) {
    return NextResponse.json({ message: 'name is required' }, { status: 400 });
  }

  const response = await fetch(backendUrl('/projects'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: body.name, description: body.description })
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
