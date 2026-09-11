import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// NOTE: we intentionally do NOT throw if DATABASE_URL is missing here.
// This module gets imported during `next build` (static page-data collection)
// when DATABASE_URL is not yet available (it's a runtime-only variable on
// Railway). Throwing at import time crashes the build. The pool below is
// only actually used when a request handler runs a query, at which point
// DATABASE_URL is guaranteed to be set in the deployed environment.
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
