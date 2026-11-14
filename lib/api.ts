import 'server-only';
import { NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/authorize';
import { getCurrentUser, type AuthUser } from '@/lib/auth';
import type { Permission } from '@/lib/permissions';

import { ApiError } from '@/lib/errors';

export { ApiError };

/**
 * Runs an API handler for a database account with the given permission. ApiErrors become
 * JSON error responses; anything else is logged and reported as a generic failure.
 */
export async function handleApi(
  /** null when the handler checks finer-grained rules itself; a signed-in account is still required. */
  permission: Permission | null,
  handler: (user: AuthUser) => Promise<Response>,
): Promise<Response> {
  const auth = permission
    ? await requireApiPermission(permission)
    : (await getCurrentUser()) ?? NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (auth instanceof NextResponse) return auth;
  if (auth.isDemo) {
    return NextResponse.json({ error: 'Demo accounts cannot save data. Sign in with a database account.' }, { status: 403 });
  }
  try {
    return await handler(auth);
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('API request failed:', error);
    return NextResponse.json({ error: 'Something went wrong. Nothing was saved; please try again.' }, { status: 500 });
  }
}

/** Parses a positive integer id from a route segment or form field. */
export function parseId(value: unknown, notFoundMessage = 'Not found.') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(notFoundMessage, 404);
  return id;
}

/** Reads a JSON object body, or throws a 400. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError('Invalid request.');
}
