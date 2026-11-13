import { handleImportRequest, parseBatchId } from '@/lib/imports/api';
import { getBatchForUser, ImportError } from '@/lib/imports/server';
import { writeAudit } from '@/lib/audit';

/** Downloads the preserved original file. Downloads are audited. */
export async function GET(_request: Request, { params }: { params: { batchId: string } }) {
  return handleImportRequest('import.view', async (user) => {
    const batch = await getBatchForUser(user, parseBatchId(params.batchId), { withFile: true });
    if (!batch?.original_file) throw new ImportError('Import batch not found.', 404);
    await writeAudit({ userId: user.id, action: 'import_download', tableName: 'import_batch', recordId: batch.batch_id });
    return new Response(new Uint8Array(batch.original_file), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="batch-${batch.batch_id}-${batch.filename.replace(/[^\w.-]+/g, '_')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
