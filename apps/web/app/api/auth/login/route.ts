import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { backendUrl } from '../../../../lib/backend';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; name?: string };

  if (!body.email || !body.name) {
    return NextResponse.json(
      { message: 'email and name are required' },
      { status: 400 }
    );
  }

  const response = await fetch(backendUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email, name: body.name })
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { message: data?.message ?? 'Login failed' },
      { status: response.status }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set('snapspace_access_token', data.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  cookieStore.set('snapspace_refresh_token', data.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });

  return NextResponse.json({ user: data.user });
}
