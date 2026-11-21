import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

const TRANSIENT_POOL_ERROR_PATTERN =
  /Connection terminated unexpectedly|terminating connection|ECONNRESET|ETIMEDOUT|EPIPE|57P01|57P02|57P03|08006|08003/i;

export const createPool = (): Pool => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      allowExitOnIdle: true,
    });

    global._postgresPool.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err || '');
      if (TRANSIENT_POOL_ERROR_PATTERN.test(msg)) {
        // Cloud SQL Developer Edition scales to zero and closes idle TCP sockets;
        // pg.Pool automatically evicts the closed client and reconnects on next query.
        return;
      }
      console.warn('SQL pool client error:', msg);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { pool };

export async function testDbConnection(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  return false;
}
