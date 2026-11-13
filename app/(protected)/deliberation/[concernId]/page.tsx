import { notFound } from 'next/navigation';
import ConcernDetailPage from '@/features/deliberation/ConcernDetailPage';
import { guardRoute } from '@/lib/authorize';
import { getCurrentUser } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { getConcernDetail, staffOptions } from '@/lib/concerns/server';

export default async function Page({ params }: { params: { concernId: string } }) {
  const denied = await guardRoute('/deliberation');
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  const concernId = Number(params.concernId);
  if (!process.env.DATABASE_URL || user.isDemo || !Number.isSafeInteger(concernId) || concernId <= 0) notFound();

  const detail = await getConcernDetail(user, concernId);
  if (!detail) notFound();

  // Staff names are only needed by people who record deliberations or assign actions.
  const needsStaff = detail.can.deliberate || detail.can.intervene;
  const [staff, types] = await Promise.all([
    needsStaff ? staffOptions(detail.concern.campus_id) : [],
    getPool().query<{ code: string; name: string }>('SELECT code, name FROM intervention_type ORDER BY intervention_type_id'),
  ]);
  return <ConcernDetailPage detail={detail} staff={staff} interventionTypes={types.rows} />;
}
