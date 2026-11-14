import { NextResponse } from 'next/server';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/lib/password';
import { createDemoSession, verifyDemoCredentials } from '@/lib/demo-auth';
import { writeAuditBestEffort } from '@/lib/audit';
import { clientIp, retryAfterSeconds, waitMessage } from '@/lib/login-limit';
import { clearFailures, countRecentFailures, recordFailure } from '@/lib/login-attempts';

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

  const ip = clientIp(request.headers);
  const wait = retryAfterSeconds(await countRecentFailures(email, ip));
  if (wait > 0) {
    await writeAuditBestEffort({ userId: null, action: 'login_blocked', tableName: 'app_users', metadata: { email, ip } });
    return NextResponse.json({ error: waitMessage(wait) }, { status: 429, headers: { 'Retry-After': String(wait) } });
  }

  const result = await getPool().query<{
    id: string;
    password_hash: string;
    active: boolean;
    has_role: boolean;
  }>(
    `SELECT id, password_hash, active,
            EXISTS (SELECT 1 FROM user_role ur WHERE ur.user_id = app_users.id) AS has_role
       FROM app_users WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );
  const user = result.rows[0];
  const passwordMatches = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

  if (!user || !user.active || !passwordMatches) {
    await recordFailure(email, ip);
    await writeAuditBestEffort({
      userId: user?.id ?? null,
      action: 'login_failed',
      tableName: 'app_users',
      metadata: user ? { reason: user.active ? 'wrong_password' : 'inactive' } : { reason: 'unknown_email', email },
    });
    return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
  }

  if (!user.has_role) {
    await writeAuditBestEffort({ userId: user.id, action: 'login_failed', tableName: 'app_users', metadata: { reason: 'no_role' } });
    return NextResponse.json(
      { error: 'Your account has no role assigned yet. Contact your system administrator.' },
      { status: 403 },
    );
  }

  await clearFailures(email);
  const token = await createSession(user.id);
  await writeAuditBestEffort({ userId: user.id, action: 'login', tableName: 'app_users', recordId: user.id });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
