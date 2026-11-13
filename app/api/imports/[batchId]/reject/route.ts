import { NextResponse } from 'next/server';
import { handleImportRequest, parseBatchId } from '@/lib/imports/api';
import { rejectGradeBatch } from '@/lib/imports/server';

export async function POST(_request: Request, { params }: { params: { batchId: string } }) {
  return handleImportRequest('import.upload', async (user) => {
    await rejectGradeBatch(user, parseBatchId(params.batchId));
    return NextResponse.json({ ok: true });
  });
}
