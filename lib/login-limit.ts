// Rules for slowing down password guessing. Pure functions, so they can be unit tested;
// the database side lives in lib/login-attempts.ts.

export const LOGIN_WINDOW_MINUTES = 15;
/** Failed sign-ins allowed for one email within the window. */
export const MAX_FAILURES_PER_EMAIL = 5;
/** Failed sign-ins allowed from one network address within the window (several staff may share one). */
export const MAX_FAILURES_PER_IP = 30;

export type FailureCounts = {
  email: number;
  ip: number;
  /** When the oldest counted failure happened, for the matching limit. */
  oldestEmail: Date | null;
  oldestIp: Date | null;
};

/** Seconds until sign-in is allowed again, or 0 when it is allowed now. */
export function retryAfterSeconds(counts: FailureCounts, now: Date = new Date()): number {
  const windowMs = LOGIN_WINDOW_MINUTES * 60_000;
  const waits: number[] = [];
  if (counts.email >= MAX_FAILURES_PER_EMAIL && counts.oldestEmail) {
    waits.push(counts.oldestEmail.getTime() + windowMs - now.getTime());
  }
  if (counts.ip >= MAX_FAILURES_PER_IP && counts.oldestIp) {
    waits.push(counts.oldestIp.getTime() + windowMs - now.getTime());
  }
  if (waits.length === 0) return 0;
  return Math.max(1, Math.ceil(Math.max(...waits) / 1000));
}

/**
 * The client's address. Behind a reverse proxy (Caddy, nginx, a hosting platform) the first
 * X-Forwarded-For entry is the visitor. Without a proxy that header can be faked, which is
 * why the per-email limit does not depend on it.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
  return ip.slice(0, 64);
}

/** Minutes, rounded up, for the "try again" message. */
export function waitMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `Too many failed sign-ins. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
