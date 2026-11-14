// Cross-site request check for the API. Runs in middleware, so it must not import server code.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * True when a request may change data. Browsers send Origin on every POST, and
 * Sec-Fetch-Site on all modern versions; a request from another site is refused even
 * though it would carry the session cookie (for example a hidden upload form).
 * Requests with neither header come from non-browser tools, which have no cookie to abuse.
 */
export function isSameOriginRequest(method: string, headers: Headers): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;

  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

  const origin = headers.get('origin');
  if (!origin) return true;
  if (origin === 'null') return false;

  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
