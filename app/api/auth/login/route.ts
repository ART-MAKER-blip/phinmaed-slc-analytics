import { NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/lib/password';
import { createDemoSession, verifyDemoCredentials } from '@/lib/demo-auth';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('email' in body) ||
    !('password' in body) ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string' ||
    body.email.length > 254 ||
    body.password.length > 1024
  ) {
    return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;
  if (process.env.NODE_ENV === 'development') {
    const demoUser = verifyDemoCredentials(email, password);
    if (demoUser) {
      const response = NextResponse.json({ ok: true });
      response.cookies.set(SESSION_COOKIE, createDemoSession(demoUser.role), sessionCookieOptions());
      return response;
    }
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    }
  }

  const result = await getPool().query<{
    id: string;
    password_hash: string;
    active: boolean;
  }>('SELECT id, password_hash, active FROM app_users WHERE lower(email) = $1 LIMIT 1', [email]);
  const user = result.rows[0];
  const passwordMatches = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

  if (!user || !user.active || !passwordMatches) {
    return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
  }

  const token = await createSession(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
