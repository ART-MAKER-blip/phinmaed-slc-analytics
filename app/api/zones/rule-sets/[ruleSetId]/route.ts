import { NextResponse } from 'next/server';
import { ApiError, handleApi, parseId, readJson } from '@/lib/api';
import { hasPermission } from '@/lib/access';
import { deleteDraftRuleSet, retireRuleSet, updateDraftRuleSet } from '@/lib/snapshots/server';

/** { action: 'update' | 'delete' } needs rules.configure; { action: 'retire' } needs rules.approve. */
export async function POST(request: Request, { params }: { params: { ruleSetId: string } }) {
  return handleApi(null, async (user) => {
    const id = parseId(params.ruleSetId, 'Rule set not found.');
    const body = await readJson(request);
    const needs = body.action === 'retire' ? 'rules.approve' : 'rules.configure';
    if (!hasPermission(user, needs)) throw new ApiError('You do not have permission to do this.', 403);
    if (body.action === 'update') return NextResponse.json(await updateDraftRuleSet(user, id, body));
    if (body.action === 'delete') return NextResponse.json(await deleteDraftRuleSet(user, id));
    if (body.action === 'retire') return NextResponse.json(await retireRuleSet(user, id));
    throw new ApiError('Unknown action.');
  });
}
