-- Migration: plaid_item -> external_item with provider discriminator
-- Date: 2026-05-06
-- Context: introduces multi-aggregator support (Plaid + SnapTrade).
--
-- Run BEFORE `npm run db:push`. drizzle-kit doesn't know how to express
-- in-place renames; running db:push first would DROP plaid_item and
-- CREATE external_item — losing the live Wells Fargo item. This script
-- mutates the existing row in place inside a transaction.
--
-- Run via psql:
--   psql "$DIRECT_DATABASE_URL" -f docs/migrations/2026-05-06-external-item.sql
--
-- Or paste into Supabase Studio SQL editor (Settings → SQL).
--
-- Idempotent caveat: this script is one-shot. Re-running after a successful
-- apply will fail at the first ALTER TABLE because plaid_item no longer
-- exists. Wrap in BEGIN/COMMIT so a partial failure rolls back cleanly.

BEGIN;

-- 1. Rename the table.
ALTER TABLE plaid_item RENAME TO external_item;

-- 2. Add the provider discriminator. Backfill 'plaid' for the existing row
-- (Wells Fargo); enforce NOT NULL after backfill so future inserts must
-- specify a provider.
ALTER TABLE external_item ADD COLUMN provider TEXT;
UPDATE external_item SET provider = 'plaid';
ALTER TABLE external_item ALTER COLUMN provider SET NOT NULL;

-- 3. Add provider_state JSONB and migrate the Plaid /transactions/sync
-- cursor into it under the `transactionsCursor` key. Then drop the
-- top-level cursor column. Default '{}' so reads can index without a
-- null guard.
ALTER TABLE external_item
  ADD COLUMN provider_state JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE external_item
  SET provider_state = jsonb_build_object('transactionsCursor', transactions_cursor)
  WHERE transactions_cursor IS NOT NULL AND transactions_cursor <> '';
ALTER TABLE external_item DROP COLUMN transactions_cursor;

-- 4. Rename Plaid-specific columns to provider-neutral names.
-- access_token -> secret reflects that SnapTrade's userSecret will
-- live in the same column for SnapTrade rows.
ALTER TABLE external_item RENAME COLUMN plaid_item_id TO provider_item_id;
ALTER TABLE external_item RENAME COLUMN plaid_institution_id TO provider_institution_id;
ALTER TABLE external_item RENAME COLUMN access_token TO secret;

-- 5. Rename the FK column on error_log. Other FKs (financial_account.item_id,
-- recurring_stream.item_id) are already named provider-neutrally.
ALTER TABLE error_log RENAME COLUMN plaid_item_id TO external_item_id;

-- 6. RLS — table rename preserves RLS state, so this is just a re-affirm
-- against the lesson in CLAUDE.md ("drizzle-kit push doesn't emit ENABLE
-- ROW LEVEL SECURITY for new tables"). Default-deny for anon/authenticated
-- via no policies attached; Drizzle bypasses via the postgres role.
ALTER TABLE external_item ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Post-apply verification:
--   SELECT id, provider, provider_item_id, institution_name, status,
--          provider_state, last_synced_at FROM external_item;
-- Expect: 1 row, provider='plaid', provider_state contains transactionsCursor.

-- Then run `npm run db:push` to confirm Drizzle reports no schema diff.
-- If it tries to make changes, abort — something diverged.
