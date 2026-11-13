import { NextResponse } from 'next/server';
import { handleApi, parseId, readJson } from '@/lib/api';
import { runSnapshot } from '@/lib/snapshots/server';

/** Calculates zones for one campus, term and grading period from the imported grades. */
export async function POST(request: Request) {
  return handleApi('zones.calculate', async (user) => {
    const body = await readJson(request);
    const result = await runSnapshot(
      user,
      parseId(body.campusId, 'Choose a campus.'),
      parseId(body.termId, 'Choose a term.'),
      parseId(body.periodId, 'Choose a period.'),
    );
    return NextResponse.json(result, { status: 201 });
  });
}
