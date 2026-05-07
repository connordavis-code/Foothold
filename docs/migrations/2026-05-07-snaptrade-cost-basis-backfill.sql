-- Patch: convert SnapTrade-sourced holding.cost_basis from per-share to total
-- Date: 2026-05-07
-- Context: pre-fix syncSnaptradeItem stored SnapTrade's
-- `average_purchase_price` (per-share) directly into holdings.cost_basis,
-- but the column carries Plaid's convention (total). The /investments
-- gain % math computes (institutionValue − costBasis) / costBasis and
-- exploded for multi-share positions.
--
-- Fix shipped in b8ebf1d multiplies at the sync boundary going forward.
-- This patch backfills the existing rows in-place via cost_basis * quantity.
--
-- Idempotency: run ONCE. If run twice, cost_basis becomes
-- per_share * quantity² which is 20x+ too high. Safe to run before the
-- next sync because the next sync's onConflictDoUpdate will write the
-- correct total computed from avg_purchase_price * units, which equals
-- this patch's output.
--
-- Plaid-sourced holdings are excluded by the JOIN filter — Plaid's
-- cost_basis is already a total.

BEGIN;

UPDATE holding
SET cost_basis = cost_basis * quantity
WHERE id IN (
  SELECT h.id FROM holding h
  JOIN financial_account fa ON fa.id = h.account_id
  JOIN external_item ei ON ei.id = fa.item_id
  WHERE ei.provider = 'snaptrade'
);

COMMIT;
