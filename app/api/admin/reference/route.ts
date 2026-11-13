import { NextResponse } from 'next/server';
import { handleApi, readJson } from '@/lib/api';
import { referenceAction } from '@/lib/admin/server';

export async function POST(request: Request) {
  return handleApi('admin.reference_data', async (user) => NextResponse.json(await referenceAction(user, await readJson(request))));
}
