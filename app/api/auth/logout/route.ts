import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revokeSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { writeAuditBestEffort } from '@/lib/audit';

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token && !token.startsWith('demo.')) {
    const userId = await revokeSession(token);
    if (userId) await writeAuditBestEffort({ userId, action: 'logout', tableName: 'app_users', recordId: userId });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return response;
}
