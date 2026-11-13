import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { handleApi, readJson } from '@/lib/api';
import { changeOwnPassword } from '@/lib/admin/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST(request: Request) {
  return handleApi(null, async (user) => {
    await changeOwnPassword(user, cookies().get(SESSION_COOKIE)?.value ?? '', await readJson(request));
    return NextResponse.json({ ok: true });
  });
}
