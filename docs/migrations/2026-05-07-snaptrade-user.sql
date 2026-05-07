-- Migration: add snaptrade_user table + relax external_item.secret nullability
-- Date: 2026-05-07
-- Context: Phase B of multi-aggregator. SnapTrade auth is per-USER
-- (one userSecret per Foothold user), not per-connection like Plaid.
-- The credential lives on its own table; external_item rows for
-- SnapTrade keep .secret NULL.
--
-- Run BEFORE pushing the matching code commit.
--   node scripts/run-migration.mjs docs/migrations/2026-05-07-snaptrade-user.sql

BEGIN;

-- 1. Drop NOT NULL on external_item.secret. Plaid rows always set it
-- (access_token); SnapTrade rows will be NULL because their per-user
-- userSecret lives on snaptrade_user.
ALTER TABLE external_item ALTER COLUMN secret DROP NOT NULL;

-- 2. Create snaptrade_user (1:1 with user — UNIQUE on user_id).
CREATE TABLE snaptrade_user (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  snaptrade_user_id text NOT NULL,
  snaptrade_user_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS — required for every public.* table per CLAUDE.md
-- "Database access boundary" guard. drizzle-kit push wouldn't have
-- emitted this for a new table, so we apply manually.
ALTER TABLE snaptrade_user ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Post-apply verification:
--   \d snaptrade_user
--   SELECT * FROM snaptrade_user;  -- empty until first SnapTrade connect
--   SELECT column_name, is_nullable FROM information_schema.columns
--     WHERE table_name = 'external_item' AND column_name = 'secret';
-- Expect: snaptrade_user table exists with RLS, external_item.secret is_nullable=YES.
