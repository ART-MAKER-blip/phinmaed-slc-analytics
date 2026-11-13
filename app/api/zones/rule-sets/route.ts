import { NextResponse } from 'next/server';
import { handleApi, readJson } from '@/lib/api';
import { createDraftRuleSet } from '@/lib/snapshots/server';

export async function POST(request: Request) {
  return handleApi('rules.configure', async (user) => NextResponse.json(await createDraftRuleSet(user, await readJson(request)), { status: 201 }));
}
