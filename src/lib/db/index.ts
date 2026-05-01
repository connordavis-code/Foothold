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
 */
const queryClient = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 10,
});

export const db = drizzle(queryClient, { schema });

export type DB = typeof db;
