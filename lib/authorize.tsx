import 'server-only';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { canOpenRoute, hasPermission } from '@/lib/access';
import { getCurrentUser, type AuthUser } from '@/lib/auth';
import { writeAuditBestEffort } from '@/lib/audit';
import type { Permission } from '@/lib/permissions';

function AccessDenied() {
  return (
    <section className="card mx-auto mt-10 max-w-lg p-6">
      <h1 className="text-xl font-bold">You do not have access to this page</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Your role does not include this module. If you need it, ask your system administrator to review your access.
      </p>
    </section>
  );
}

/**
 * Page guard. Returns an access-denied view when the signed-in user may not open the route,
 * or null when the page may render. Denials are written to the audit log.
 *
 *   const denied = await guardRoute('/imports');
 *   if (denied) return denied;
 */
export async function guardRoute(path: string) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (canOpenRoute(user, path)) return null;

  if (!user.isDemo) {
    await writeAuditBestEffort({ userId: user.id, action: 'access_denied', metadata: { path } });
  }
  return <AccessDenied />;
}

/**
 * API guard. Returns the user, or a 401/403 response to send back.
 *
 *   const auth = await requireApiPermission('import.upload');
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireApiPermission(permission: Permission): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (hasPermission(user, permission)) return user;

  if (!user.isDemo) {
    await writeAuditBestEffort({ userId: user.id, action: 'access_denied', metadata: { permission } });
  }
  return NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 });
}
