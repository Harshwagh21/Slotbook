import { Pool, type PoolClient } from "pg";
import { DATABASE_URL } from "./config";

// One pool per process. Reused across Next.js hot reloads in dev.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

/** Shared Postgres connection pool for this process. */
export function getPool(): Pool {
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = new Pool({ connectionString: DATABASE_URL, max: 10 });
  }
  return globalForPg.pgPool;
}

/** Runs fn inside BEGIN/COMMIT, rolling back on any thrown error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
