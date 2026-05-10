import { describe, expect, it } from 'vitest';
import {
  type CapabilityState,
  type ClassifyInput,
  type SyncCapability,
  classifyItemHealth,
  FRESHNESS_POLICY,
} from './health';

const NOW = new Date('2026-05-08T00:00:00Z');
const HOUR = 60 * 60 * 1000;

function tracked(opts: {
  successHoursAgo?: number;
  failureHoursAgo?: number;
  failureSummary?: string;
}): CapabilityState {
  return {
    kind: 'tracked',
    lastSuccessAt:
      opts.successHoursAgo === undefined
        ? null
        : new Date(NOW.getTime() - opts.successHoursAgo * HOUR),
    lastFailureAt:
      opts.failureHoursAgo === undefined
        ? null
        : new Date(NOW.getTime() - opts.failureHoursAgo * HOUR),
    lastFailureSummary: opts.failureSummary ?? null,
  };
}

const NA: CapabilityState = { kind: 'not_applicable' };

function plaidInput(
  caps: Partial<Record<SyncCapability, CapabilityState>>,
  itemStatus: string = 'active',
): ClassifyInput {
  return {
    provider: 'plaid',
    itemStatus,
    capabilities: {
      balances: caps.balances ?? NA,
      transactions: caps.transactions ?? NA,
      investments: caps.investments ?? NA,
      recurring: caps.recurring ?? NA,
    },
    now: NOW,
  };
}

function snaptradeInput(
  caps: Partial<Record<SyncCapability, CapabilityState>>,
  itemStatus: string = 'active',
): ClassifyInput {
  return {
    provider: 'snaptrade',
    itemStatus,
    capabilities: {
      balances: caps.balances ?? NA,
      transactions: caps.transactions ?? NA,
      investments: caps.investments ?? NA,
      recurring: caps.recurring ?? NA,
    },
    now: NOW,
  };
}

// ─────────────────────────────────────────────────────────────────────
// needs_reconnect precedence
// ─────────────────────────────────────────────────────────────────────

describe('classifyItemHealth — needs_reconnect precedence', () => {
  // Heart of the trust contract: if the item itself reports the user
  // must act, no amount of "transactions are fresh" should hide that.
  it('login_required overrides all-fresh capabilities', () => {
    const out = classifyItemHealth(
      plaidInput(
        {
          balances: tracked({ successHoursAgo: 1 }),
          transactions: tracked({ successHoursAgo: 1 }),
          investments: tracked({ successHoursAgo: 1 }),
          recurring: tracked({ successHoursAgo: 1 }),
        },
        'login_required',
      ),
    );
    expect(out.state).toBe('needs_reconnect');
    expect(out.requiresUserAction).toBe(true);
    expect(out.reason).toMatch(/login/i);
  });

  it('login_required overrides all-failing capabilities', () => {
    const out = classifyItemHealth(
      plaidInput(
        {
          balances: tracked({ failureHoursAgo: 1 }),
          transactions: tracked({ failureHoursAgo: 1 }),
        },
        'login_required',
      ),
    );
    expect(out.state).toBe('needs_reconnect');
    expect(out.requiresUserAction).toBe(true);
  });

  it('permission_revoked is needs_reconnect with permission-flavored reason', () => {
    const out = classifyItemHealth(
      plaidInput(
        { transactions: tracked({ successHoursAgo: 1 }) },
        'permission_revoked',
      ),
    );
    expect(out.state).toBe('needs_reconnect');
    expect(out.requiresUserAction).toBe(true);
    expect(out.reason).toMatch(/permission/i);
  });

  it('pending_expiration is a softer needs_reconnect (advisory)', () => {
    const out = classifyItemHealth(
      plaidInput(
        { transactions: tracked({ successHoursAgo: 1 }) },
        'pending_expiration',
      ),
    );
    expect(out.state).toBe('needs_reconnect');
    expect(out.reason).toMatch(/pending|expir/i);
  });

  it('generic provider error → needs_reconnect (fail-closed)', () => {
    const out = classifyItemHealth(
      plaidInput({ transactions: tracked({ successHoursAgo: 1 }) }, 'error'),
    );
    expect(out.state).toBe('needs_reconnect');
  });

  // Defensive: an unrecognized status is treated as needs_reconnect
  // so a future provider state we haven't seen doesn't silently mask
  // a real broken connection.
  it('unrecognized status falls through to needs_reconnect', () => {
    const out = classifyItemHealth(
      plaidInput(
        { transactions: tracked({ successHoursAgo: 1 }) },
        'unknown_state_42',
      ),
    );
    expect(out.state).toBe('needs_reconnect');
    expect(out.reason).toContain('unknown_state_42');
  });

  it('active status does NOT short-circuit — capability aggregation runs', () => {
    const out = classifyItemHealth(
      plaidInput(
        {
          balances: tracked({ successHoursAgo: 1 }),
          transactions: tracked({ successHoursAgo: 1 }),
          investments: tracked({ successHoursAgo: 1 }),
          recurring: tracked({ successHoursAgo: 1 }),
        },
        'active',
      ),
    );
    expect(out.state).toBe('healthy');
    expect(out.requiresUserAction).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Capability not_applicable handling
// ─────────────────────────────────────────────────────────────────────

describe('classifyItemHealth — capability not_applicable', () => {
  // SnapTrade has no separate balance refresh path — positions carry
  // balance data, refreshed daily by SnapTrade. Marking balances N/A
  // must not drag the headline state to stale.
  it('SnapTrade with N/A balances + fresh investments is healthy', () => {
    const out = classifyItemHealth(
      snaptradeInput({
        balances: NA,
        transactions: tracked({ successHoursAgo: 6 }),
        investments: tracked({ successHoursAgo: 6 }),
        recurring: NA,
      }),
    );
    expect(out.state).toBe('healthy');
    expect(out.byCapability.balances).toBe('not_applicable');
    expect(out.byCapability.recurring).toBe('not_applicable');
  });

  // Plaid credit-only item (AmEx) — no investments capability.
  it('Plaid credit-only item with N/A investments + fresh balances/transactions/recurring is healthy', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ successHoursAgo: 1 }),
        transactions: tracked({ successHoursAgo: 6 }),
        investments: NA,
        recurring: tracked({ successHoursAgo: 6 }),
      }),
    );
    expect(out.state).toBe('healthy');
    expect(out.byCapability.investments).toBe('not_applicable');
  });

  it('all capabilities N/A → unknown', () => {
    const out = classifyItemHealth(plaidInput({}));
    expect(out.state).toBe('unknown');
    expect(out.reason).toMatch(/no applicable/i);
  });

  // Defensive: if Phase 3 ever sends a `tracked` state for a
  // capability the policy table doesn't cover (e.g. SnapTrade
  // balances), treat it as not_applicable rather than letting the
  // misclassification corrupt aggregate health.
  it('SnapTrade balances passed as tracked is defensively N/A', () => {
    const out = classifyItemHealth(
      snaptradeInput({
        balances: tracked({ successHoursAgo: 1000 }), // would otherwise be stale
        investments: tracked({ successHoursAgo: 6 }),
        transactions: tracked({ successHoursAgo: 6 }),
      }),
    );
    expect(out.byCapability.balances).toBe('not_applicable');
    expect(out.state).toBe('healthy');
  });

  it('SnapTrade with all N/A except investments fresh is healthy', () => {
    const out = classifyItemHealth(
      snaptradeInput({
        investments: tracked({ successHoursAgo: 6 }),
      }),
    );
    expect(out.state).toBe('healthy');
  });

  it('failed N/A capability does not contribute to failed/degraded', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: NA,
        transactions: tracked({ successHoursAgo: 1 }),
      }),
    );
    expect(out.state).toBe('healthy');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Provider-specific freshness windows
// ─────────────────────────────────────────────────────────────────────

describe('classifyItemHealth — provider freshness windows', () => {
  // Plaid balances policy is 12h (6h cron + 1 missed-run slack).
  it('Plaid balances 11h after success → fresh', () => {
    const out = classifyItemHealth(
      plaidInput({ balances: tracked({ successHoursAgo: 11 }) }),
    );
    expect(out.byCapability.balances).toBe('fresh');
    expect(out.state).toBe('healthy');
  });

  it('Plaid balances 13h after success → stale', () => {
    const out = classifyItemHealth(
      plaidInput({ balances: tracked({ successHoursAgo: 13 }) }),
    );
    expect(out.byCapability.balances).toBe('stale');
    expect(out.state).toBe('stale');
  });

  // Transactions/investments share the 36h nightly window.
  it('Plaid transactions 35h after success → fresh', () => {
    const out = classifyItemHealth(
      plaidInput({ transactions: tracked({ successHoursAgo: 35 }) }),
    );
    expect(out.byCapability.transactions).toBe('fresh');
  });

  it('Plaid transactions 37h after success → stale', () => {
    const out = classifyItemHealth(
      plaidInput({ transactions: tracked({ successHoursAgo: 37 }) }),
    );
    expect(out.byCapability.transactions).toBe('stale');
  });

  it('Plaid investments 36h boundary is fresh (inclusive)', () => {
    const out = classifyItemHealth(
      plaidInput({ investments: tracked({ successHoursAgo: 36 }) }),
    );
    expect(out.byCapability.investments).toBe('fresh');
  });

  it('Plaid recurring uses transactions-style 36h window', () => {
    const out = classifyItemHealth(
      plaidInput({ recurring: tracked({ successHoursAgo: 35 }) }),
    );
    expect(out.byCapability.recurring).toBe('fresh');
  });

  // SnapTrade investments uses the same 36h policy as Plaid (nightly
  // cron); the upstream daily-cache constraint isn't expressed here.
  it('SnapTrade investments 35h after success → fresh', () => {
    const out = classifyItemHealth(
      snaptradeInput({ investments: tracked({ successHoursAgo: 35 }) }),
    );
    expect(out.byCapability.investments).toBe('fresh');
  });

  it('SnapTrade investments 37h after success → stale', () => {
    const out = classifyItemHealth(
      snaptradeInput({ investments: tracked({ successHoursAgo: 37 }) }),
    );
    expect(out.byCapability.investments).toBe('stale');
    expect(out.state).toBe('stale');
  });

  // Sanity: the policy table itself is the contract that Phase 3 reads.
  it('FRESHNESS_POLICY exposes plaid balances + nightly windows', () => {
    expect(FRESHNESS_POLICY.plaid.balances?.staleHours).toBe(12);
    expect(FRESHNESS_POLICY.plaid.transactions?.staleHours).toBe(36);
    expect(FRESHNESS_POLICY.plaid.investments?.staleHours).toBe(36);
    expect(FRESHNESS_POLICY.plaid.recurring?.staleHours).toBe(36);
  });

  it('FRESHNESS_POLICY omits SnapTrade balances and recurring', () => {
    expect(FRESHNESS_POLICY.snaptrade.balances).toBeUndefined();
    expect(FRESHNESS_POLICY.snaptrade.recurring).toBeUndefined();
    expect(FRESHNESS_POLICY.snaptrade.transactions?.staleHours).toBe(36);
    expect(FRESHNESS_POLICY.snaptrade.investments?.staleHours).toBe(36);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Partial failures (degraded vs failed)
// ─────────────────────────────────────────────────────────────────────

describe('classifyItemHealth — partial failures', () => {
  // The heart of the trust model: one capability failing while
  // others succeed must read as degraded, not failed. Operator
  // sees "balances broken, transactions fine" rather than a blanket
  // alarm.
  it('1 fresh + 1 failed → degraded', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({ successHoursAgo: 1 }),
      }),
    );
    expect(out.state).toBe('degraded');
    expect(out.requiresUserAction).toBe(false);
    expect(out.byCapability.balances).toBe('failed_recent');
    expect(out.byCapability.transactions).toBe('fresh');
  });

  it('2 fresh + 1 failed + 1 N/A → degraded', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ successHoursAgo: 1 }),
        transactions: tracked({ successHoursAgo: 6 }),
        investments: tracked({ failureHoursAgo: 2 }),
        recurring: NA,
      }),
    );
    expect(out.state).toBe('degraded');
    expect(out.reason).toMatch(/1 of 3/);
  });

  it('3 fresh + 1 stale + 0 failed → stale (no failures = no degraded)', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ successHoursAgo: 1 }),
        transactions: tracked({ successHoursAgo: 1 }),
        investments: tracked({ successHoursAgo: 1 }),
        recurring: tracked({ successHoursAgo: 50 }), // > 36h window
      }),
    );
    expect(out.state).toBe('stale');
  });

  it('1 fresh + 1 stale + 1 failed → degraded (failure dominates stale)', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ successHoursAgo: 1 }),
        transactions: tracked({ successHoursAgo: 50 }), // stale
        investments: tracked({ failureHoursAgo: 2 }),
      }),
    );
    expect(out.state).toBe('degraded');
  });

  it('all 4 capabilities failed → failed (not degraded)', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({ failureHoursAgo: 1 }),
        investments: tracked({ failureHoursAgo: 1 }),
        recurring: tracked({ failureHoursAgo: 1 }),
      }),
    );
    expect(out.state).toBe('failed');
    expect(out.requiresUserAction).toBe(false); // engineering action, not user
  });

  // SnapTrade can degrade too: investments failing while transactions
  // are fresh is degraded, not failed.
  it('SnapTrade investments failed + transactions fresh → degraded', () => {
    const out = classifyItemHealth(
      snaptradeInput({
        transactions: tracked({ successHoursAgo: 6 }),
        investments: tracked({ failureHoursAgo: 1 }),
      }),
    );
    expect(out.state).toBe('degraded');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Failure summaries flow into reason
// ─────────────────────────────────────────────────────────────────────

describe('classifyItemHealth — failure summaries in reason', () => {
  it('degraded reason includes per-capability failure summary', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({
          failureHoursAgo: 1,
          failureSummary: 'HTTP 400 INVALID_FIELD',
        }),
        transactions: tracked({ successHoursAgo: 1 }),
      }),
    );
    expect(out.state).toBe('degraded');
    expect(out.reason).toContain('balances');
    expect(out.reason).toContain('HTTP 400 INVALID_FIELD');
  });

  it('failed reason concatenates summaries from multiple capabilities', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({
          failureHoursAgo: 1,
          failureSummary: 'HTTP 400',
        }),
        transactions: tracked({
          failureHoursAgo: 1,
          failureSummary: 'ITEM_LOGIN_REQUIRED',
        }),
      }),
    );
    expect(out.state).toBe('failed');
    expect(out.reason).toContain('balances: HTTP 400');
    expect(out.reason).toContain('transactions: ITEM_LOGIN_REQUIRED');
  });

  it('failed without summaries omits the dangling separator', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({ failureHoursAgo: 1 }),
      }),
    );
    expect(out.state).toBe('failed');
    expect(out.reason).not.toContain('—');
  });
});

// ─────────────────────────────────────────────────────────────────────
// healthy + recovery
// ─────────────────────────────────────────────────────────────────────

describe('classifyItemHealth — healthy + recovery', () => {
  it('all 4 Plaid capabilities fresh → healthy', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ successHoursAgo: 1 }),
        transactions: tracked({ successHoursAgo: 6 }),
        investments: tracked({ successHoursAgo: 6 }),
        recurring: tracked({ successHoursAgo: 6 }),
      }),
    );
    expect(out.state).toBe('healthy');
    expect(out.reason).toMatch(/fresh/i);
  });

  // Recovery — last failure is older than last success. The failure
  // is no longer load-bearing; the capability is fresh.
  it('success newer than failure → fresh, not failed_recent', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ successHoursAgo: 1, failureHoursAgo: 100 }),
        transactions: tracked({ successHoursAgo: 1 }),
      }),
    );
    expect(out.byCapability.balances).toBe('fresh');
    expect(out.state).toBe('healthy');
  });

  // Tiebreak: when the timestamps are exactly equal, success wins.
  it('success and failure at the same instant → fresh (success wins tie)', () => {
    const same = new Date(NOW.getTime() - 1 * HOUR);
    const out = classifyItemHealth({
      provider: 'plaid',
      itemStatus: 'active',
      capabilities: {
        balances: {
          kind: 'tracked',
          lastSuccessAt: same,
          lastFailureAt: same,
        },
        transactions: NA,
        investments: NA,
        recurring: NA,
      },
      now: NOW,
    });
    expect(out.byCapability.balances).toBe('fresh');
    expect(out.state).toBe('healthy');
  });
});

// ─────────────────────────────────────────────────────────────────────
// never_synced + unknown
// ─────────────────────────────────────────────────────────────────────

describe('classifyItemHealth — never_synced + unknown', () => {
  it('all applicable capabilities never_synced → unknown', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({}),
        transactions: tracked({}),
        investments: tracked({}),
        recurring: tracked({}),
      }),
    );
    expect(out.state).toBe('unknown');
    expect(out.byCapability.balances).toBe('never_synced');
  });

  // Mix of fresh + never_synced is stale, not unknown — we have *some*
  // data, just gaps. Operator sees "X capabilities never synced" so
  // they know which are gaps.
  it('mix of fresh + never_synced → stale', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ successHoursAgo: 1 }),
        transactions: tracked({}),
      }),
    );
    expect(out.state).toBe('stale');
    expect(out.reason).toMatch(/never synced/i);
  });

  // Regression for review of 54270a9: the prior aggregation rule
  // classified failed + never_synced as `degraded` even though no
  // capability was actually working. `degraded` semantically requires
  // at least one success-backed capability (fresh or stale). When the
  // only signals are an acute failure and "no data," the correct
  // verdict is `failed` — fail closed for the trust surface.
  it('failed + never_synced (no success-backed) → failed, NOT degraded', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({}),
      }),
    );
    expect(out.state).toBe('failed');
    expect(out.reason).toMatch(/never synced/i);
  });

  // A capability with only a failure on record (no prior success) is
  // currently failing — it's never been working.
  it('failure-only history (no success) → failed_recent', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({ failureHoursAgo: 1 }),
      }),
    );
    expect(out.byCapability.balances).toBe('failed_recent');
    expect(out.state).toBe('failed');
  });
});

// ─────────────────────────────────────────────────────────────────────
// degraded semantic contract: requires success-backed capability
// ─────────────────────────────────────────────────────────────────────

describe('classifyItemHealth — degraded requires success-backed data', () => {
  // Locks in the corrected contract from review of 54270a9.
  // degraded means "some failing AND some working" — `working` here
  // strictly means a capability with prior successful data (fresh or
  // stale). never_synced is not working.

  it('failed + fresh → degraded (success-backed exists)', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({ successHoursAgo: 1 }),
      }),
    );
    expect(out.state).toBe('degraded');
  });

  it('failed + stale → degraded (stale is success-backed)', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({ successHoursAgo: 50 }), // > 36h
      }),
    );
    expect(out.state).toBe('degraded');
    expect(out.byCapability.transactions).toBe('stale');
  });

  it('failed + never_synced + stale → degraded (stale rescues classification)', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({}),
        investments: tracked({ successHoursAgo: 50 }), // stale, success-backed
      }),
    );
    expect(out.state).toBe('degraded');
  });

  it('failed + multiple never_synced (no fresh/stale) → failed', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({}),
        investments: tracked({}),
      }),
    );
    expect(out.state).toBe('failed');
    expect(out.reason).toMatch(/never synced/i);
  });

  it('all failed → failed (existing behavior preserved)', () => {
    const out = classifyItemHealth(
      plaidInput({
        balances: tracked({ failureHoursAgo: 1 }),
        transactions: tracked({ failureHoursAgo: 1 }),
      }),
    );
    expect(out.state).toBe('failed');
    expect(out.reason).toMatch(/all 2 applicable/i);
  });
});
