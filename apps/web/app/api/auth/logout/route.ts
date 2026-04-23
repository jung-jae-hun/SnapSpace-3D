import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { backendUrl } from '../../../../lib/backend';

export async function POST() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('snapspace_access_token')?.value;

  if (accessToken) {
    await fetch(backendUrl('/auth/logout'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }).catch(() => undefined);
  }

  cookieStore.delete('snapspace_access_token');
  cookieStore.delete('snapspace_refresh_token');

  return NextResponse.json({ ok: true });
}
