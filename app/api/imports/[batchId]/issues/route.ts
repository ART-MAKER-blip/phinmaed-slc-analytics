import { handleApi, parseId } from '@/lib/api';
import { getBatchForUser, getBatchIssues, ImportError } from '@/lib/imports/server';
import { toCsv } from '@/lib/imports/csv';

/** The batch's error report as CSV. */
export async function GET(_request: Request, { params }: { params: { batchId: string } }) {
  return handleApi('import.view', async (user) => {
    const batch = await getBatchForUser(user, parseId(params.batchId, 'Import batch not found.'));
    if (!batch) throw new ImportError('Import batch not found.', 404);
    const issues = await getBatchIssues(batch.batch_id);
    const csv = toCsv([
      ['row', 'issue_type', 'message', 'resolution'],
      ...issues.map((i) => [i.row_number ?? 'file', i.issue_type, i.message, i.resolution_status]),
    ]);
    return new Response(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="batch-${batch.batch_id}-issues.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
