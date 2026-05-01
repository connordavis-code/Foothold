import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * Database client. Uses Supabase's transaction-mode pgbouncer pooler for
 * runtime queries (which doesn't support prepared statements — hence
 * `prepare: false`).
 *
 * For migrations (drizzle-kit), set DIRECT_DATABASE_URL in the env, which
 * connects to port 5432 directly without the pooler.
 *
 * Cache the postgres client on globalThis in development. Without this, every
 * HMR cycle would create a new pool and eventually exhaust Supabase's
 * connection limit. In production each lambda gets a fresh module load anyway.
 */
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.pgClient ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });

export type DB = typeof db;
