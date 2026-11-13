import { notFound } from 'next/navigation';
import BatchPage from '@/features/imports/BatchPage';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/access';
import { getBatchForUser, getBatchIssues, getIssueTypeCounts, previewRows } from '@/lib/imports/server';

const ISSUE_LIMIT = 500;
const PREVIEW_ROWS = 50;

export default async function Page({ params }: { params: { batchId: string } }) {
  const denied = await guardRoute('/imports');
  if (denied) return denied;
  const user = (await getCurrentUser())!;

  const batchId = Number(params.batchId);
  if (!process.env.DATABASE_URL || user.isDemo || !Number.isSafeInteger(batchId) || batchId <= 0) notFound();

  const batch = await getBatchForUser(user, batchId, { withFile: true });
  if (!batch?.original_file) notFound();

  const [issues, typeCounts] = await Promise.all([getBatchIssues(batchId, ISSUE_LIMIT + 1), getIssueTypeCounts(batchId)]);
  const { original_file: file, ...summary } = batch;

  return (
    <BatchPage
      batch={summary}
      issues={issues.slice(0, ISSUE_LIMIT)}
      issuesTruncated={issues.length > ISSUE_LIMIT}
      typeCounts={typeCounts}
      preview={previewRows(file, PREVIEW_ROWS)}
      canDecide={hasPermission(user, 'import.upload')}
    />
  );
}
