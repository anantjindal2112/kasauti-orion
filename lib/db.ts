import pg from "pg";

/**
 * One small connection pool per server instance. The database is reached through Supabase's transaction pooler, so
 * keep the pool tiny: serverless instances multiply, and each connection counts against the pooler's limit.
 * Server only. All Kasauti tables live in the `kasauti` schema.
 */
const globalForDb = globalThis as unknown as { kasautiPool?: pg.Pool };

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function pool(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  globalForDb.kasautiPool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  return globalForDb.kasautiPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

/** Run several statements as one transaction. */
export async function tx<T>(fn: (q: <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(async <R extends pg.QueryResultRow>(text: string, params: unknown[] = []) => (await client.query<R>(text, params)).rows);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
