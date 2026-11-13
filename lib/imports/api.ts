import 'server-only';
import { NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/authorize';
import type { AuthUser } from '@/lib/auth';
import type { Permission } from '@/lib/permissions';
import { ImportError } from './server';

/** Checks permission (real accounts only) and turns ImportError into a JSON error response. */
export async function handleImportRequest(
  permission: Permission,
  handler: (user: AuthUser) => Promise<Response>,
): Promise<Response> {
  const auth = await requireApiPermission(permission);
  if (auth instanceof NextResponse) return auth;
  if (auth.isDemo) {
    return NextResponse.json({ error: 'Imports need a database account. Demo accounts cannot save data.' }, { status: 403 });
  }
  try {
    return await handler(auth);
  } catch (error) {
    if (error instanceof ImportError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Import request failed:', error);
    return NextResponse.json({ error: 'Something went wrong. Nothing was saved; please try again.' }, { status: 500 });
  }
}

export function parseBatchId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ImportError('Import batch not found.', 404);
  return id;
}
