import { NextResponse } from 'next/server';
import { handleApi, parseId } from '@/lib/api';
import { verifySnapshot } from '@/lib/snapshots/server';

/** Recomputes a saved run and reports whether it matches (test case 20). */
export async function POST(_request: Request, { params }: { params: { runId: string } }) {
  return handleApi('zones.calculate', async (user) =>
    NextResponse.json(await verifySnapshot(user, parseId(params.runId, 'Snapshot run not found.'))),
  );
}
