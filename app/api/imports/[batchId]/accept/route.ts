import { NextResponse } from 'next/server';
import { handleApi, parseId } from '@/lib/api';
import { acceptGradeBatch } from '@/lib/imports/server';

export async function POST(_request: Request, { params }: { params: { batchId: string } }) {
  return handleApi('import.upload', async (user) =>
    NextResponse.json(await acceptGradeBatch(user, parseId(params.batchId, 'Import batch not found.'))),
  );
}
