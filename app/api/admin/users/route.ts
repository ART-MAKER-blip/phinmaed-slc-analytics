import { NextResponse } from 'next/server';
import { handleApi, readJson } from '@/lib/api';
import { createUser } from '@/lib/admin/server';

/** Creates an account. The response carries a one-time temporary password to hand to the user. */
export async function POST(request: Request) {
  return handleApi('admin.users', async (user) => NextResponse.json(await createUser(user, await readJson(request)), { status: 201 }));
}
