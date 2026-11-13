import { NextResponse } from 'next/server';
import { handleApi, parseId } from '@/lib/api';
import { approveRuleSet } from '@/lib/snapshots/server';

export async function POST(_request: Request, { params }: { params: { ruleSetId: string } }) {
  return handleApi('rules.approve', async (user) => {
    await approveRuleSet(user, parseId(params.ruleSetId, 'Rule set not found.'));
    return NextResponse.json({ ok: true });
  });
}
