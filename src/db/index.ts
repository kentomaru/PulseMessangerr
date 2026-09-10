import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: NodePgDatabase;
};

// IMPORTANT: do not read process.env.DATABASE_URL or construct the Pool at
// module scope. Next.js imports route modules while collecting page data at
// *build* time, before any real runtime env vars (e.g. Railway's reference
// to the Postgres service) are guaranteed to be present. Creating the pool
// eagerly makes `next build` crash with "DATABASE_URL is required" even
// though no request was ever made. Instead, connect lazily on first actual
// use (i.e. the first query inside a request handler).
function getPool(): Pool {
  if (globalForDb.__arenaNextJsPostgresqlPool) {
    return globalForDb.__arenaNextJsPostgresqlPool;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  globalForDb.__arenaNextJsPostgresqlPool = pool;
  return pool;
}

function getDb(): NodePgDatabase {
  if (!globalForDb.__arenaNextJsPostgresqlDb) {
    globalForDb.__arenaNextJsPostgresqlDb = drizzle(getPool());
  }
  return globalForDb.__arenaNextJsPostgresqlDb;
}

// `pool`/`db` keep their old names so every existing `import { db } from
// "@/db"` call site works unchanged, but they're now Proxies that defer
// the real connection until a property (e.g. `db.select`) is actually
// accessed at request time, not at module-import time.
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool(), prop, receiver);
  },
});

export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
