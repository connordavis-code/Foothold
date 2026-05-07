-- Migration: rename plaid_*_id → provider_*_id for honesty
-- Date: 2026-05-07
-- Context: After multi-aggregator went live, plaid_account_id /
-- plaid_security_id / plaid_investment_transaction_id columns started
-- holding SnapTrade UUIDs alongside Plaid namespace IDs (UUIDs don't
-- collide so reuse was safe, but the column name became dishonest).
-- Pure rename — preserves data, indexes, and uniqueness constraints
-- via ALTER TABLE RENAME COLUMN.
--
-- ORDERING: this migration MUST run before the matching code deploy
-- becomes live, OR within seconds of the deploy finishing. Either
-- direction has a brief window where prod code looks for columns that
-- don't exist. cron.balance_refresh is already failing on a separate
-- 400, the user isn't actively syncing, and the next scheduled cron
-- isn't for hours — picking the migration-first ordering and pushing
-- immediately after.
--
--   node scripts/run-migration.mjs docs/migrations/2026-05-07-provider-neutral-columns.sql

BEGIN;

ALTER TABLE financial_account
  RENAME COLUMN plaid_account_id TO provider_account_id;

ALTER TABLE security
  RENAME COLUMN plaid_security_id TO provider_security_id;

ALTER TABLE investment_transaction
  RENAME COLUMN plaid_investment_transaction_id TO provider_investment_transaction_id;

COMMIT;

-- Post-apply verification:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name IN ('financial_account', 'security', 'investment_transaction')
--       AND column_name LIKE '%_id'
--     ORDER BY table_name, column_name;
-- Expect: provider_account_id, provider_security_id, provider_investment_transaction_id
-- (no rows starting with 'plaid_').
