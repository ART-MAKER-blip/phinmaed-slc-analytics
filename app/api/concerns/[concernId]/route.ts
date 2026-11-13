import { NextResponse } from 'next/server';
import { handleApi, parseId, readJson } from '@/lib/api';
import { concernAction } from '@/lib/concerns/server';

/**
 * One change to a concern: { action: 'deliberation' | 'intervention' | 'follow_up' | 'referral'
 * | 'referral_status' | 'referral_note' | 'status', ...fields }. Each action checks its own
 * rules, because support teams and intervention owners may update only their part.
 */
export async function POST(request: Request, { params }: { params: { concernId: string } }) {
  return handleApi(null, async (user) =>
    NextResponse.json(await concernAction(user, parseId(params.concernId, 'Concern not found.'), await readJson(request))),
  );
}
