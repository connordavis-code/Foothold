import { describe, expect, it } from 'vitest';
import {
  type RawTimestamps,
  aggregateTopLevelTimestamps,
  buildCapabilityStates,
  inferCapabilities,
} from './health';

// ─────────────────────────────────────────────────────────────────────
// inferCapabilities — provider × account-type → applicable capabilities
// ─────────────────────────────────────────────────────────────────────

describe('inferCapabilities — Plaid', () => {
  it('depository-only item → balances + transactions + recurring (no investments)', () => {
    expect(inferCapabilities('plaid', ['depository'])).toEqual([
      'balances',
      'transactions',
      'recurring',
    ]);
  });

  it('credit-only item (e.g. AmEx) → balances + transactions + recurring (no investments)', () => {
    expect(inferCapabilities('plaid', ['credit'])).toEqual([
      'balances',
      'transactions',
      'recurring',
    ]);
  });

  it('depository + credit → balances + transactions + recurring (still no investments)', () => {
    const caps = inferCapabilities('plaid', ['depository', 'credit']);
    expect(caps).toContain('balances');
    expect(caps).toContain('transactions');
    expect(caps).toContain('recurring');
    expect(caps).not.toContain('investments');
  });

  it('depository + investment → all four capabilities', () => {
    const caps = inferCapabilities('plaid', ['depository', 'investment']);
    expect(caps.sort()).toEqual(
      ['balances', 'investments', 'recurring', 'transactions'].sort(),
    );
  });

  // An investment-only Plaid item has no regular transactions stream
  // and no recurring detection — both depend on depository/credit.
  it('investment-only item → investments only (no balances/transactions/recurring)', () => {
    expect(inferCapabilities('plaid', ['investment'])).toEqual(['investments']);
  });

  // Loan accounts intentionally don't produce a `balances` capability —
  // matches Phase 1's `selectRefreshableAccounts` which restricts to
  // depository+credit. Treat loan-only items conservatively as
  // having zero applicable capabilities; the source classifies as
  // `unknown` until per-loan capability handling lands.
  it('loan-only item → no applicable capabilities (matches Phase 1 filter)', () => {
    expect(inferCapabilities('plaid', ['loan'])).toEqual([]);
  });

  it('empty account types → empty (defensive)', () => {
    expect(inferCapabilities('plaid', [])).toEqual([]);
  });

  it('unknown account type → no false-positive capabilities', () => {
    expect(inferCapabilities('plaid', ['other'])).toEqual([]);
  });
});

describe('inferCapabilities — SnapTrade', () => {
  // SnapTrade brokerages always sync accounts → positions → activities.
  // Capabilities are fixed regardless of account types passed in.
  it('investment account types → transactions + investments', () => {
    expect(inferCapabilities('snaptrade', ['investment'])).toEqual([
      'transactions',
      'investments',
    ]);
  });

  it('hardcoded set even when account types are absent', () => {
    expect(inferCapabilities('snaptrade', [])).toEqual([
      'transactions',
      'investments',
    ]);
  });

  it('hardcoded set ignores unrelated account types', () => {
    // Hypothetical: a SnapTrade source surfacing a depository row
    // (shouldn't happen today, but defensive). Capability set still
    // collapses to brokerage-only.
    expect(inferCapabilities('snaptrade', ['depository'])).toEqual([
      'transactions',
      'investments',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// buildCapabilityStates — translate raw timestamps to per-cap states
// ─────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-05-08T00:00:00Z');
const HOUR = 60 * 60 * 1000;

function ts(hoursAgo: number): Date {
  return new Date(NOW.getTime() - hoursAgo * HOUR);
}

const EMPTY_RAW: RawTimestamps = {
  lastBalanceSuccessAt: null,
  lastBalanceFailureAt: null,
  lastBalanceFailureMessage: null,
  lastNightlySuccessAt: null,
  lastNightlyFailureAt: null,
  lastNightlyFailureMessage: null,
};

describe('buildCapabilityStates', () => {
  it('all 4 applicable → all 4 tracked, sharing nightly timestamps for transactions/investments/recurring', () => {
    const raw: RawTimestamps = {
      lastBalanceSuccessAt: ts(2),
      lastBalanceFailureAt: null,
      lastBalanceFailureMessage: null,
      lastNightlySuccessAt: ts(8),
      lastNightlyFailureAt: null,
      lastNightlyFailureMessage: null,
    };
    const out = buildCapabilityStates(
      ['balances', 'transactions', 'investments', 'recurring'],
      raw,
    );
    expect(out.balances).toEqual({
      kind: 'tracked',
      lastSuccessAt: ts(2),
      lastFailureAt: null,
      lastFailureSummary: null,
    });
    expect(out.transactions).toEqual({
      kind: 'tracked',
      lastSuccessAt: ts(8),
      lastFailureAt: null,
      lastFailureSummary: null,
    });
    // transactions/investments/recurring share the same nightly state
    expect(out.investments).toEqual(out.transactions);
    expect(out.recurring).toEqual(out.transactions);
  });

  it('no applicable → all 4 capabilities are not_applicable', () => {
    const out = buildCapabilityStates([], EMPTY_RAW);
    expect(out.balances).toEqual({ kind: 'not_applicable' });
    expect(out.transactions).toEqual({ kind: 'not_applicable' });
    expect(out.investments).toEqual({ kind: 'not_applicable' });
    expect(out.recurring).toEqual({ kind: 'not_applicable' });
  });

  it('SnapTrade-shaped input → balances + recurring N/A, transactions + investments tracked', () => {
    const raw: RawTimestamps = {
      lastBalanceSuccessAt: null,
      lastBalanceFailureAt: null,
      lastBalanceFailureMessage: null,
      lastNightlySuccessAt: ts(10),
      lastNightlyFailureAt: null,
      lastNightlyFailureMessage: null,
    };
    const out = buildCapabilityStates(
      ['transactions', 'investments'],
      raw,
    );
    expect(out.balances).toEqual({ kind: 'not_applicable' });
    expect(out.recurring).toEqual({ kind: 'not_applicable' });
    expect(out.transactions.kind).toBe('tracked');
    expect(out.investments.kind).toBe('tracked');
  });

  it('Plaid credit-only-shaped input → investments N/A, balances + transactions + recurring tracked', () => {
    const out = buildCapabilityStates(
      ['balances', 'transactions', 'recurring'],
      EMPTY_RAW,
    );
    expect(out.investments).toEqual({ kind: 'not_applicable' });
    expect(out.balances.kind).toBe('tracked');
    expect(out.transactions.kind).toBe('tracked');
    expect(out.recurring.kind).toBe('tracked');
  });

  it('failure summaries flow through to lastFailureSummary', () => {
    const raw: RawTimestamps = {
      lastBalanceSuccessAt: null,
      lastBalanceFailureAt: ts(1),
      lastBalanceFailureMessage: 'HTTP 400 INVALID_FIELD',
      lastNightlySuccessAt: null,
      lastNightlyFailureAt: ts(3),
      lastNightlyFailureMessage: 'ITEM_LOGIN_REQUIRED',
    };
    const out = buildCapabilityStates(
      ['balances', 'transactions'],
      raw,
    );
    if (out.balances.kind !== 'tracked') throw new Error('expected tracked');
    if (out.transactions.kind !== 'tracked') throw new Error('expected tracked');
    expect(out.balances.lastFailureSummary).toBe('HTTP 400 INVALID_FIELD');
    expect(out.transactions.lastFailureSummary).toBe('ITEM_LOGIN_REQUIRED');
  });

  it('null failure message preserves null on the tracked state', () => {
    const raw: RawTimestamps = {
      ...EMPTY_RAW,
      lastBalanceFailureAt: ts(1),
      lastBalanceFailureMessage: null,
    };
    const out = buildCapabilityStates(['balances'], raw);
    if (out.balances.kind !== 'tracked') throw new Error('expected tracked');
    expect(out.balances.lastFailureSummary).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// aggregateTopLevelTimestamps — max-success/latest-failure across ops
// ─────────────────────────────────────────────────────────────────────

describe('aggregateTopLevelTimestamps', () => {
  it('all null → all null', () => {
    expect(aggregateTopLevelTimestamps(EMPTY_RAW)).toEqual({
      lastSuccessfulSyncAt: null,
      lastFailureAt: null,
      lastFailureSummary: null,
    });
  });

  it('returns the most recent success across balance + nightly', () => {
    const raw: RawTimestamps = {
      lastBalanceSuccessAt: ts(2),
      lastBalanceFailureAt: null,
      lastBalanceFailureMessage: null,
      lastNightlySuccessAt: ts(8),
      lastNightlyFailureAt: null,
      lastNightlyFailureMessage: null,
    };
    expect(aggregateTopLevelTimestamps(raw).lastSuccessfulSyncAt).toEqual(
      ts(2),
    );
  });

  it('only-balance success → that success is the top-level', () => {
    const raw: RawTimestamps = {
      ...EMPTY_RAW,
      lastBalanceSuccessAt: ts(5),
    };
    expect(aggregateTopLevelTimestamps(raw).lastSuccessfulSyncAt).toEqual(
      ts(5),
    );
  });

  // The most-recent failure wins for the summary even if the
  // older failure had a more interesting message — UI consumers
  // can read per-capability detail from `byCapability` if needed.
  it('returns the most recent failure with its message', () => {
    const raw: RawTimestamps = {
      ...EMPTY_RAW,
      lastBalanceFailureAt: ts(1),
      lastBalanceFailureMessage: 'HTTP 400',
      lastNightlyFailureAt: ts(5),
      lastNightlyFailureMessage: 'older nightly error',
    };
    const agg = aggregateTopLevelTimestamps(raw);
    expect(agg.lastFailureAt).toEqual(ts(1));
    expect(agg.lastFailureSummary).toBe('HTTP 400');
  });

  it('preserves null lastFailureSummary when the most-recent failure has no message', () => {
    const raw: RawTimestamps = {
      ...EMPTY_RAW,
      lastBalanceFailureAt: ts(1),
      lastBalanceFailureMessage: null,
    };
    const agg = aggregateTopLevelTimestamps(raw);
    expect(agg.lastFailureAt).toEqual(ts(1));
    expect(agg.lastFailureSummary).toBeNull();
  });

  it('failure-only history (no successes) → success is null, failure populated', () => {
    const raw: RawTimestamps = {
      ...EMPTY_RAW,
      lastBalanceFailureAt: ts(1),
      lastBalanceFailureMessage: 'first failure',
    };
    const agg = aggregateTopLevelTimestamps(raw);
    expect(agg.lastSuccessfulSyncAt).toBeNull();
    expect(agg.lastFailureAt).toEqual(ts(1));
  });
});
