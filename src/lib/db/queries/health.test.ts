import { describe, expect, it } from 'vitest';
import {
  type CapabilityTimestamps,
  type RawOpTimestamps,
  type ResolvedCapabilityTimestamps,
  aggregateTopLevelTimestamps,
  buildCapabilityStates,
  inferCapabilities,
  resolveCapabilityTimestamps,
} from './health';

const NOW = new Date('2026-05-08T00:00:00Z');
const HOUR = 60 * 60 * 1000;

function ts(hoursAgo: number): Date {
  return new Date(NOW.getTime() - hoursAgo * HOUR);
}

const EMPTY_CAP: CapabilityTimestamps = {
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureMessage: null,
};

const EMPTY_OPS: RawOpTimestamps = {
  balanceSuccessAt: null,
  balanceFailureAt: null,
  balanceFailureMessage: null,
  nightlySuccessAt: null,
  nightlyFailureAt: null,
  nightlyFailureMessage: null,
  snaptradeActivitiesFailureAt: null,
  snaptradeActivitiesFailureMessage: null,
  snaptradePositionsFailureAt: null,
  snaptradePositionsFailureMessage: null,
};

const EMPTY_RESOLVED: ResolvedCapabilityTimestamps = {
  balances: EMPTY_CAP,
  transactions: EMPTY_CAP,
  investments: EMPTY_CAP,
  recurring: EMPTY_CAP,
};

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

  it('investment-only item → investments only', () => {
    expect(inferCapabilities('plaid', ['investment'])).toEqual(['investments']);
  });

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
    expect(inferCapabilities('snaptrade', ['depository'])).toEqual([
      'transactions',
      'investments',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// resolveCapabilityTimestamps — op-class → per-capability resolution
// ─────────────────────────────────────────────────────────────────────

describe('resolveCapabilityTimestamps — Plaid', () => {
  it('nightly cron success populates transactions/investments/recurring', () => {
    const out = resolveCapabilityTimestamps('plaid', null, {
      ...EMPTY_OPS,
      nightlySuccessAt: ts(8),
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(8));
    expect(out.investments.lastSuccessAt).toEqual(ts(8));
    expect(out.recurring.lastSuccessAt).toEqual(ts(8));
    expect(out.transactions).toEqual(out.investments);
    expect(out.transactions).toEqual(out.recurring);
  });

  it('balance cron drives balances independently', () => {
    const out = resolveCapabilityTimestamps('plaid', null, {
      ...EMPTY_OPS,
      balanceSuccessAt: ts(2),
      balanceFailureAt: ts(5),
      balanceFailureMessage: 'HTTP 400',
    });
    expect(out.balances.lastSuccessAt).toEqual(ts(2));
    expect(out.balances.lastFailureAt).toEqual(ts(5));
    expect(out.balances.lastFailureMessage).toBe('HTTP 400');
  });

  // High #1 fix: lastSyncedAt fallback. A freshly connected item will
  // have lastSyncedAt set (manual / initial sync writes it) but no
  // cron.nightly_sync.item info row yet. Without the fallback,
  // capabilities classify as never_synced and the source state shows
  // unknown right after a successful connect.
  it('lastSyncedAt fills in when no nightly cron info row exists', () => {
    const out = resolveCapabilityTimestamps('plaid', ts(0.1), {
      ...EMPTY_OPS,
      // nightlySuccessAt: null
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(0.1));
    expect(out.investments.lastSuccessAt).toEqual(ts(0.1));
    expect(out.recurring.lastSuccessAt).toEqual(ts(0.1));
  });

  it('lastSyncedAt + nightly cron info row → max wins', () => {
    // Manual sync just ran (lastSyncedAt fresh), but the most recent
    // cron info row is older. Manual sync timestamp wins.
    const out = resolveCapabilityTimestamps('plaid', ts(1), {
      ...EMPTY_OPS,
      nightlySuccessAt: ts(20),
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(1));
  });

  it('lastSyncedAt older than cron info row → cron wins', () => {
    // Cron just ran (which also bumps lastSyncedAt — they should match,
    // but defensively we still take max).
    const out = resolveCapabilityTimestamps('plaid', ts(20), {
      ...EMPTY_OPS,
      nightlySuccessAt: ts(2),
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(2));
  });

  it('Plaid nightly failure applies to all three nightly capabilities', () => {
    const out = resolveCapabilityTimestamps('plaid', null, {
      ...EMPTY_OPS,
      nightlyFailureAt: ts(3),
      nightlyFailureMessage: 'ITEM_LOGIN_REQUIRED',
    });
    expect(out.transactions.lastFailureAt).toEqual(ts(3));
    expect(out.investments.lastFailureAt).toEqual(ts(3));
    expect(out.recurring.lastFailureAt).toEqual(ts(3));
    expect(out.transactions.lastFailureMessage).toBe('ITEM_LOGIN_REQUIRED');
  });

  it('Plaid ignores SnapTrade-specific error ops', () => {
    // Plaid items shouldn't have these ops in error_log, but defensive:
    // even if they appear, they don't leak into the resolved output.
    const out = resolveCapabilityTimestamps('plaid', null, {
      ...EMPTY_OPS,
      snaptradeActivitiesFailureAt: ts(1),
      snaptradePositionsFailureAt: ts(1),
    });
    expect(out.transactions.lastFailureAt).toBeNull();
    expect(out.investments.lastFailureAt).toBeNull();
  });
});

describe('resolveCapabilityTimestamps — SnapTrade', () => {
  it('nightly cron success populates transactions and investments (balances/recurring zero)', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      nightlySuccessAt: ts(10),
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(10));
    expect(out.investments.lastSuccessAt).toEqual(ts(10));
    // balances + recurring are N/A for SnapTrade — buildCapabilityStates
    // emits not_applicable regardless of timestamps. We don't bother
    // populating these.
  });

  it('lastSyncedAt fallback also applies to SnapTrade', () => {
    const out = resolveCapabilityTimestamps('snaptrade', ts(0.5), EMPTY_OPS);
    expect(out.transactions.lastSuccessAt).toEqual(ts(0.5));
    expect(out.investments.lastSuccessAt).toEqual(ts(0.5));
  });

  // High #2 fix: snaptrade.sync.activities errors must surface as
  // transactions failure even when cron.nightly_sync.item rolls up
  // as success. Otherwise per-capability failures vanish from health.
  it('snaptrade.sync.activities error surfaces as transactions failure', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      snaptradeActivitiesFailureAt: ts(1),
      snaptradeActivitiesFailureMessage: 'rate_limit',
    });
    expect(out.transactions.lastFailureAt).toEqual(ts(1));
    expect(out.transactions.lastFailureMessage).toBe('rate_limit');
    // Doesn't bleed into investments
    expect(out.investments.lastFailureAt).toBeNull();
  });

  it('snaptrade.sync.positions error surfaces as investments failure', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      snaptradePositionsFailureAt: ts(2),
      snaptradePositionsFailureMessage: 'positions_error',
    });
    expect(out.investments.lastFailureAt).toEqual(ts(2));
    expect(out.investments.lastFailureMessage).toBe('positions_error');
    expect(out.transactions.lastFailureAt).toBeNull();
  });

  it('snaptrade activities error newer than nightly cron error → activities wins for transactions', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      nightlyFailureAt: ts(10),
      nightlyFailureMessage: 'orchestrator failed',
      snaptradeActivitiesFailureAt: ts(2),
      snaptradeActivitiesFailureMessage: 'rate_limit',
    });
    expect(out.transactions.lastFailureAt).toEqual(ts(2));
    expect(out.transactions.lastFailureMessage).toBe('rate_limit');
  });

  it('nightly cron error newer than activities error → cron wins for transactions', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      nightlyFailureAt: ts(2),
      nightlyFailureMessage: 'orchestrator failed',
      snaptradeActivitiesFailureAt: ts(10),
      snaptradeActivitiesFailureMessage: 'old activities error',
    });
    expect(out.transactions.lastFailureAt).toEqual(ts(2));
    expect(out.transactions.lastFailureMessage).toBe('orchestrator failed');
  });

  it('positions error and activities error each route to their own capability', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      snaptradeActivitiesFailureAt: ts(1),
      snaptradeActivitiesFailureMessage: 'activities oops',
      snaptradePositionsFailureAt: ts(2),
      snaptradePositionsFailureMessage: 'positions oops',
    });
    expect(out.transactions.lastFailureMessage).toBe('activities oops');
    expect(out.investments.lastFailureMessage).toBe('positions oops');
  });
});

// ─────────────────────────────────────────────────────────────────────
// buildCapabilityStates — resolved per-capability → CapabilityState
// ─────────────────────────────────────────────────────────────────────

describe('buildCapabilityStates', () => {
  it('all 4 applicable → all 4 tracked, passing through resolved timestamps', () => {
    const resolved: ResolvedCapabilityTimestamps = {
      balances: { lastSuccessAt: ts(2), lastFailureAt: null, lastFailureMessage: null },
      transactions: { lastSuccessAt: ts(8), lastFailureAt: null, lastFailureMessage: null },
      investments: { lastSuccessAt: ts(8), lastFailureAt: null, lastFailureMessage: null },
      recurring: { lastSuccessAt: ts(8), lastFailureAt: null, lastFailureMessage: null },
    };
    const out = buildCapabilityStates(
      ['balances', 'transactions', 'investments', 'recurring'],
      resolved,
    );
    expect(out.balances).toEqual({
      kind: 'tracked',
      lastSuccessAt: ts(2),
      lastFailureAt: null,
      lastFailureSummary: null,
    });
    expect(out.transactions.kind).toBe('tracked');
    expect(out.investments.kind).toBe('tracked');
    expect(out.recurring.kind).toBe('tracked');
  });

  it('no applicable → all 4 capabilities are not_applicable', () => {
    const out = buildCapabilityStates([], EMPTY_RESOLVED);
    expect(out.balances).toEqual({ kind: 'not_applicable' });
    expect(out.transactions).toEqual({ kind: 'not_applicable' });
    expect(out.investments).toEqual({ kind: 'not_applicable' });
    expect(out.recurring).toEqual({ kind: 'not_applicable' });
  });

  it('SnapTrade-shaped applicable → balances + recurring N/A, transactions + investments tracked', () => {
    const resolved: ResolvedCapabilityTimestamps = {
      balances: EMPTY_CAP,
      transactions: { lastSuccessAt: ts(10), lastFailureAt: null, lastFailureMessage: null },
      investments: { lastSuccessAt: ts(10), lastFailureAt: null, lastFailureMessage: null },
      recurring: EMPTY_CAP,
    };
    const out = buildCapabilityStates(
      ['transactions', 'investments'],
      resolved,
    );
    expect(out.balances).toEqual({ kind: 'not_applicable' });
    expect(out.recurring).toEqual({ kind: 'not_applicable' });
    expect(out.transactions.kind).toBe('tracked');
    expect(out.investments.kind).toBe('tracked');
  });

  it('Plaid credit-only-shaped applicable → investments N/A, others tracked', () => {
    const out = buildCapabilityStates(
      ['balances', 'transactions', 'recurring'],
      EMPTY_RESOLVED,
    );
    expect(out.investments).toEqual({ kind: 'not_applicable' });
    expect(out.balances.kind).toBe('tracked');
    expect(out.transactions.kind).toBe('tracked');
    expect(out.recurring.kind).toBe('tracked');
  });

  it('failure summaries flow through to lastFailureSummary', () => {
    const resolved: ResolvedCapabilityTimestamps = {
      balances: { lastSuccessAt: null, lastFailureAt: ts(1), lastFailureMessage: 'HTTP 400' },
      transactions: { lastSuccessAt: null, lastFailureAt: ts(3), lastFailureMessage: 'ITEM_LOGIN_REQUIRED' },
      investments: EMPTY_CAP,
      recurring: EMPTY_CAP,
    };
    const out = buildCapabilityStates(
      ['balances', 'transactions'],
      resolved,
    );
    if (out.balances.kind !== 'tracked') throw new Error('expected tracked');
    if (out.transactions.kind !== 'tracked') throw new Error('expected tracked');
    expect(out.balances.lastFailureSummary).toBe('HTTP 400');
    expect(out.transactions.lastFailureSummary).toBe('ITEM_LOGIN_REQUIRED');
  });

  it('null failure message preserves null on the tracked state', () => {
    const resolved: ResolvedCapabilityTimestamps = {
      ...EMPTY_RESOLVED,
      balances: { lastSuccessAt: null, lastFailureAt: ts(1), lastFailureMessage: null },
    };
    const out = buildCapabilityStates(['balances'], resolved);
    if (out.balances.kind !== 'tracked') throw new Error('expected tracked');
    expect(out.balances.lastFailureSummary).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// aggregateTopLevelTimestamps — per-cap → top-level scalars
// ─────────────────────────────────────────────────────────────────────

describe('aggregateTopLevelTimestamps', () => {
  it('all-empty resolved → all null', () => {
    expect(aggregateTopLevelTimestamps(EMPTY_RESOLVED)).toEqual({
      lastSuccessfulSyncAt: null,
      lastFailureAt: null,
      lastFailureSummary: null,
    });
  });

  it('returns the most recent success across capabilities', () => {
    const resolved: ResolvedCapabilityTimestamps = {
      balances: { lastSuccessAt: ts(2), lastFailureAt: null, lastFailureMessage: null },
      transactions: { lastSuccessAt: ts(8), lastFailureAt: null, lastFailureMessage: null },
      investments: EMPTY_CAP,
      recurring: EMPTY_CAP,
    };
    expect(aggregateTopLevelTimestamps(resolved).lastSuccessfulSyncAt).toEqual(
      ts(2),
    );
  });

  // The most-recent failure wins for the summary.
  it('returns the most recent failure with its message', () => {
    const resolved: ResolvedCapabilityTimestamps = {
      balances: { lastSuccessAt: null, lastFailureAt: ts(1), lastFailureMessage: 'HTTP 400' },
      transactions: { lastSuccessAt: null, lastFailureAt: ts(5), lastFailureMessage: 'older error' },
      investments: EMPTY_CAP,
      recurring: EMPTY_CAP,
    };
    const agg = aggregateTopLevelTimestamps(resolved);
    expect(agg.lastFailureAt).toEqual(ts(1));
    expect(agg.lastFailureSummary).toBe('HTTP 400');
  });

  it('preserves null lastFailureSummary when most-recent failure has no message', () => {
    const resolved: ResolvedCapabilityTimestamps = {
      ...EMPTY_RESOLVED,
      balances: { lastSuccessAt: null, lastFailureAt: ts(1), lastFailureMessage: null },
    };
    const agg = aggregateTopLevelTimestamps(resolved);
    expect(agg.lastFailureAt).toEqual(ts(1));
    expect(agg.lastFailureSummary).toBeNull();
  });

  it('failure-only history (no successes) → success null, failure populated', () => {
    const resolved: ResolvedCapabilityTimestamps = {
      ...EMPTY_RESOLVED,
      balances: { lastSuccessAt: null, lastFailureAt: ts(1), lastFailureMessage: 'first' },
    };
    const agg = aggregateTopLevelTimestamps(resolved);
    expect(agg.lastSuccessfulSyncAt).toBeNull();
    expect(agg.lastFailureAt).toEqual(ts(1));
  });
});
