import 'server-only';
import type { Pool, PoolClient } from 'pg';
import { getPool } from '@/lib/db';

export type AuditEntry = {
  /** null for events with no known account, such as a failed sign-in for an unknown email. */
  userId: string | null;
  action: string;
  tableName?: string;
  recordId?: string | number;
  metadata?: Record<string, unknown>;
};

/**
 * Appends an entry to the audit log. For changes to data, pass the transaction's client
 * so the entry is saved only if the change is.
 */
export async function writeAudit(entry: AuditEntry, db: Pool | PoolClient = getPool()) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, table_name, record_id, change_metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.userId,
      entry.action,
      entry.tableName ?? null,
      entry.recordId === undefined ? null : String(entry.recordId),
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ],
  );
}

/** For events where a logging failure must not block the user (sign-in, sign-out, denials). */
export async function writeAuditBestEffort(entry: AuditEntry) {
  if (!process.env.DATABASE_URL) return;
  try {
    await writeAudit(entry);
  } catch (error) {
    console.error('Audit log write failed:', error instanceof Error ? error.message : error);
  }
}
