import 'server-only';
import { getPool } from '@/lib/db';
import { LOGIN_WINDOW_MINUTES, type FailureCounts } from '@/lib/login-limit';

export async function countRecentFailures(email: string, ip: string): Promise<FailureCounts> {
  const result = await getPool().query<{
    email_count: string;
    ip_count: string;
    oldest_email: Date | null;
    oldest_ip: Date | null;
  }>(
    `SELECT count(*) FILTER (WHERE email = $1)          AS email_count,
            count(*) FILTER (WHERE ip = $2)             AS ip_count,
            min(attempted_at) FILTER (WHERE email = $1) AS oldest_email,
            min(attempted_at) FILTER (WHERE ip = $2)    AS oldest_ip
       FROM login_attempt
      WHERE (email = $1 OR ip = $2)
        AND attempted_at > now() - make_interval(mins => $3)`,
    [email, ip, LOGIN_WINDOW_MINUTES],
  );
  const row = result.rows[0];
  return {
    email: Number(row?.email_count ?? 0),
    ip: Number(row?.ip_count ?? 0),
    oldestEmail: row?.oldest_email ?? null,
    oldestIp: row?.oldest_ip ?? null,
  };
}

export async function recordFailure(email: string, ip: string) {
  const pool = getPool();
  await pool.query(`DELETE FROM login_attempt WHERE attempted_at < now() - interval '1 day'`);
  await pool.query('INSERT INTO login_attempt (email, ip) VALUES ($1, $2)', [email, ip]);
}

/** A successful sign-in resets the count for that email (not for the address). */
export async function clearFailures(email: string) {
  await getPool().query('DELETE FROM login_attempt WHERE email = $1', [email]);
}
