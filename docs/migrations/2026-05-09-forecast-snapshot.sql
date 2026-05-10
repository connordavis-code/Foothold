-- Migration: add forecast_snapshot table
-- Date: 2026-05-09
-- Context: Phase 1 simulator reorientation, PR 2 of 5. Daily snapshot of
-- each user's baseline forecast projection. Two downstream consumers:
--   1. Backtest accuracy module (PR 5) — predicted-vs-actual variance.
--   2. Dashboard trajectory line — 90-day historical net-worth shape.
--
-- Run BEFORE pushing the matching code commit. Cron at /api/cron/forecast-snapshot
-- will start writing rows at 11:00 UTC daily once Vercel picks up the
-- schedule from vercel.json.
--
--   node scripts/run-migration.mjs docs/migrations/2026-05-09-forecast-snapshot.sql

BEGIN;

-- 1. Create forecast_snapshot table.
CREATE TABLE forecast_snapshot (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  baseline_projection jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Unique index on (user_id, snapshot_date) — natural cache key.
-- At most one snapshot per user per day; cron upsert is idempotent
-- so a manual re-run within the same UTC day overwrites cleanly.
CREATE UNIQUE INDEX forecast_snapshot_user_date_idx
  ON forecast_snapshot (user_id, snapshot_date);

-- 3. RLS — required for every public.* table per CLAUDE.md
-- "Database access boundary" guard. drizzle-kit push wouldn't have
-- emitted this for a new table, so we apply manually.
ALTER TABLE forecast_snapshot ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Post-apply verification:
--   \d forecast_snapshot
--   SELECT * FROM forecast_snapshot;  -- empty until first cron run
--   SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname = 'forecast_snapshot';
-- Expect: table exists, relrowsecurity = t.
