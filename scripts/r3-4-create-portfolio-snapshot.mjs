// One-off migration: create portfolio_snapshot table + RLS for R.3.4.
// Bypasses drizzle-kit push (which hangs on stdin even with strict:false)
// and psql (not installed locally). Uses postgres-js directly.
//
// Run: node scripts/r3-4-create-portfolio-snapshot.mjs
//
// Safe to re-run: uses IF NOT EXISTS throughout.

import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_DATABASE_URL / DATABASE_URL not set in .env.local');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql.begin(async (tx) => {
    await tx`
      CREATE TABLE IF NOT EXISTS public.portfolio_snapshot (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
        snapshot_date date NOT NULL,
        total_value numeric(14, 2) NOT NULL,
        total_cost_basis numeric(14, 2) NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `;
    await tx`
      CREATE UNIQUE INDEX IF NOT EXISTS portfolio_snapshot_user_date_idx
        ON public.portfolio_snapshot (user_id, snapshot_date)
    `;
    await tx`ALTER TABLE public.portfolio_snapshot ENABLE ROW LEVEL SECURITY`;
  });

  // Verify
  const [info] = await sql`
    SELECT
      (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'portfolio_snapshot') AS cols,
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'portfolio_snapshot_user_date_idx') AS idx,
      (SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.portfolio_snapshot'::regclass) AS rls
  `;
  console.log(
    `portfolio_snapshot: ${info.cols} columns, ${info.idx} unique index(es), RLS=${info.rls}`,
  );
  if (Number(info.cols) !== 6) throw new Error('expected 6 columns');
  if (Number(info.idx) !== 1) throw new Error('expected unique index');
  if (!info.rls) throw new Error('expected RLS enabled');
  console.log('OK');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
