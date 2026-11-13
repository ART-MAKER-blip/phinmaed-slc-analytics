import { NextResponse } from 'next/server';
import { handleApi, parseId } from '@/lib/api';
import { rejectGradeBatch } from '@/lib/imports/server';

export async function POST(_request: Request, { params }: { params: { batchId: string } }) {
  return handleApi('import.upload', async (user) => {
    await rejectGradeBatch(user, parseId(params.batchId, 'Import batch not found.'));
    return NextResponse.json({ ok: true });
  });
}
