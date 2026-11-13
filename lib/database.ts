import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var slcDatabasePool: Pool | undefined;
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to use authentication.');
  }

  globalThis.slcDatabasePool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return globalThis.slcDatabasePool;
}
