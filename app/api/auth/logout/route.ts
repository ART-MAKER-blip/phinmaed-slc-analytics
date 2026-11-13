import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revokeSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token && !token.startsWith('demo.')) await revokeSession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return response;
}
