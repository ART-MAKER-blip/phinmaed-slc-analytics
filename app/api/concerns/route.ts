import { NextResponse } from 'next/server';
import { handleApi, readJson } from '@/lib/api';
import { createConcern } from '@/lib/concerns/server';

export async function POST(request: Request) {
  return handleApi('concern.manage', async (user) => NextResponse.json(await createConcern(user, await readJson(request)), { status: 201 }));
}
