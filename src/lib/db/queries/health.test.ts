import { describe, expect, it } from 'vitest';
import {
  type CapabilityTimestamps,
  type RawOpTimestamps,
  type ResolvedCapabilityTimestamps,
  aggregateTopLevelTimestamps,
  buildCapabilityStates,
  inferCapabilities,
  isSnaptradeTransactionsUnsupported,
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
  snaptradeActivitiesSuccessAt: null,
  snaptradePositionsSuccessAt: null,
  snaptradeActivitiesFailureAt: null,
  snaptradeActivitiesFailureMessage: null,
  snaptradePositionsFailureAt: null,
  snaptradePositionsFailureMessage: null,
  dispatcherFailureAt: null,
  dispatcherFailureMessage: null,
  snaptradeActivitiesUnsupportedAt: null,
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

  it('transactionsUnsupported flag drops transactions (Fidelity-IRA pattern)', () => {
    expect(
      inferCapabilities('snaptrade', ['investment'], {
        transactionsUnsupported: true,
      }),
    ).toEqual(['investments']);
  });

  it('transactionsUnsupported: false is the same as omitting the flag', () => {
    expect(
      inferCapabilities('snaptrade', ['investment'], {
        transactionsUnsupported: false,
      }),
    ).toEqual(['transactions', 'investments']);
  });

  it('transactionsUnsupported flag is ignored for Plaid (defensive)', () => {
    // Plaid never writes the unsupported marker, but the flag should
    // be a no-op for Plaid even if the caller mistakenly passes it.
    expect(
      inferCapabilities('plaid', ['depository'], {
        transactionsUnsupported: true,
      }),
    ).toEqual(['balances', 'transactions', 'recurring']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// isSnaptradeTransactionsUnsupported — pure resolver for the marker
// ─────────────────────────────────────────────────────────────────────

describe('isSnaptradeTransactionsUnsupported', () => {
  it('no marker → false (no-op for items that have never seen 410)', () => {
    expect(
      isSnaptradeTransactionsUnsupported({
        snaptradeActivitiesUnsupportedAt: null,
        snaptradeActivitiesSuccessAt: null,
        snaptradeActivitiesFailureAt: null,
      }),
    ).toBe(false);
  });

  it('only marker present → true (every account 410d, no other signal)', () => {
    expect(
      isSnaptradeTransactionsUnsupported({
        snaptradeActivitiesUnsupportedAt: ts(2),
        snaptradeActivitiesSuccessAt: null,
        snaptradeActivitiesFailureAt: null,
      }),
    ).toBe(true);
  });

  it('newer success supersedes older marker → false (self-healing)', () => {
    // Upstream fixed it; the regular activities info row supersedes.
    expect(
      isSnaptradeTransactionsUnsupported({
        snaptradeActivitiesUnsupportedAt: ts(48),
        snaptradeActivitiesSuccessAt: ts(2),
        snaptradeActivitiesFailureAt: null,
      }),
    ).toBe(false);
  });

  it('newer failure supersedes older marker → false (transient error wins)', () => {
    // A non-410 failure means the capability is now broken-but-tracked,
    // not permanently-N/A. User should see the failure surface.
    expect(
      isSnaptradeTransactionsUnsupported({
        snaptradeActivitiesUnsupportedAt: ts(48),
        snaptradeActivitiesSuccessAt: null,
        snaptradeActivitiesFailureAt: ts(2),
      }),
    ).toBe(false);
  });

  it('marker newer than older success → true (latest cycle 410d again)', () => {
    // Brokerage worked once, then the partnership broke or the user
    // moved to an unsupported subtype.
    expect(
      isSnaptradeTransactionsUnsupported({
        snaptradeActivitiesUnsupportedAt: ts(2),
        snaptradeActivitiesSuccessAt: ts(48),
        snaptradeActivitiesFailureAt: null,
      }),
    ).toBe(true);
  });

  it('marker newer than older failure → true (failure was transient, latest cycle 410d)', () => {
    expect(
      isSnaptradeTransactionsUnsupported({
        snaptradeActivitiesUnsupportedAt: ts(2),
        snaptradeActivitiesSuccessAt: null,
        snaptradeActivitiesFailureAt: ts(48),
      }),
    ).toBe(true);
  });

  it('exact tie between marker and success → success wins (>, not >=)', () => {
    // Defensive: if both ops happen in the same millisecond (unlikely
    // but possible with batched writes), prefer the working signal so
    // we don't N/A a capability that just succeeded.
    const t = ts(2);
    expect(
      isSnaptradeTransactionsUnsupported({
        snaptradeActivitiesUnsupportedAt: t,
        snaptradeActivitiesSuccessAt: t,
        snaptradeActivitiesFailureAt: null,
      }),
    ).toBe(false);
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
// SnapTrade per-capability info rows (post-review fix)
// ─────────────────────────────────────────────────────────────────────

describe('resolveCapabilityTimestamps — SnapTrade per-capability info rows are authoritative', () => {
  // Regression for review of 4fd02ef. The "partial-failure-then-success"
  // case: activities fails inside a sync at T1, orchestrator rolls
  // up successfully at T2, lastSyncedAt updates at T2. Without
  // per-capability info logging, success > failure → fresh, masking
  // the per-capability failure. With it, the activities-info row
  // would only be written if ALL accounts succeeded — its absence
  // means we fall back to the cron+lastSyncedAt path AND the
  // activities-error timestamp wins because there's no overriding
  // success info row.
  it('activities info row overrides lastSyncedAt fallback', () => {
    // Activities info row is at T=10h ago; lastSyncedAt is fresher
    // (T=2h ago, would normally win the fallback). Per-capability
    // info row is authoritative and uses its own timestamp.
    const out = resolveCapabilityTimestamps('snaptrade', ts(2), {
      ...EMPTY_OPS,
      snaptradeActivitiesSuccessAt: ts(10),
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(10));
  });

  it('positions info row overrides lastSyncedAt fallback', () => {
    const out = resolveCapabilityTimestamps('snaptrade', ts(2), {
      ...EMPTY_OPS,
      snaptradePositionsSuccessAt: ts(10),
    });
    expect(out.investments.lastSuccessAt).toEqual(ts(10));
  });

  // Regression for second review of 5790050. The acute partial-failure
  // case: activities fails mid-sync at T1, syncSnaptradeItem suppresses
  // the activities info row (per-capability success guard), but
  // STILL updates external_item.lastSyncedAt at T2 > T1 because the
  // orchestrator otherwise completed. Without the three-branch
  // resolution, fallback would set transactions success = T2 and
  // the classifier would say fresh (T2 > T1) — masking the per-
  // capability failure entirely.
  //
  // Correct behavior: when a per-capability error exists and no
  // overriding success info row exists, transactions.lastSuccessAt
  // must be null. Failure timestamp dominates regardless of
  // lastSyncedAt.
  it('partial activities failure: lastSyncedAt newer than error → success suppressed, failure surfaces', () => {
    const lastSynced = ts(0.5); // 30 minutes ago — newer than the failure
    const out = resolveCapabilityTimestamps('snaptrade', lastSynced, {
      ...EMPTY_OPS,
      // No snaptradeActivitiesSuccessAt — partial failure suppressed it
      snaptradeActivitiesFailureAt: ts(2), // failed 2h ago
      snaptradeActivitiesFailureMessage: 'rate_limit',
      // Positions DID succeed for all accounts in the same sync
      snaptradePositionsSuccessAt: lastSynced,
    });
    // Transactions: lastSuccessAt MUST be null (do not fall back to
    // lastSyncedAt despite it being newer than the failure).
    expect(out.transactions.lastSuccessAt).toBeNull();
    expect(out.transactions.lastFailureAt).toEqual(ts(2));
    expect(out.transactions.lastFailureMessage).toBe('rate_limit');
    // Positions: info row exists → used as authoritative success
    expect(out.investments.lastSuccessAt).toEqual(lastSynced);
    expect(out.investments.lastFailureAt).toBeNull();
  });

  // Backward-compat: items synced before per-capability info logging
  // shipped have no info rows yet. Resolution falls back to the
  // pre-existing rule (max of cron + lastSyncedAt).
  it('no per-capability info rows → falls back to nightly + lastSyncedAt', () => {
    const out = resolveCapabilityTimestamps('snaptrade', ts(2), {
      ...EMPTY_OPS,
      nightlySuccessAt: ts(8),
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(2)); // lastSyncedAt wins
    expect(out.investments.lastSuccessAt).toEqual(ts(2));
  });

  // Recovery case: activities failed at T1, then succeeded at T2 < T1
  // (stale failure, fresh success). Info row drives success, error
  // row remains. success > failure → fresh.
  it('activities info newer than activities error → fresh', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      snaptradeActivitiesSuccessAt: ts(1), // recent recovery
      snaptradeActivitiesFailureAt: ts(50), // old failure
      snaptradeActivitiesFailureMessage: 'old',
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(1));
    expect(out.transactions.lastFailureAt).toEqual(ts(50));
  });

  it('activities error newer than activities info → failure surfaces', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      snaptradeActivitiesSuccessAt: ts(50),
      snaptradeActivitiesFailureAt: ts(1),
      snaptradeActivitiesFailureMessage: 'fresh failure',
    });
    expect(out.transactions.lastSuccessAt).toEqual(ts(50));
    expect(out.transactions.lastFailureAt).toEqual(ts(1));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Resolver + classifier round-trip regression
// ─────────────────────────────────────────────────────────────────────

describe('SnapTrade partial-failure end-to-end (resolver + classifier)', () => {
  // The reviewer's exact regression ask: prove that
  //   "activities error + no activities success row + newer lastSyncedAt"
  // produces byCapability.transactions === 'failed_recent' all the
  // way through buildCapabilityStates → classifyItemHealth. Asserting
  // resolver-layer values alone (lastSuccessAt null, lastFailureAt set)
  // is necessary but not sufficient — the classifier still has to
  // translate that into a failed_recent verdict.
  it('classifies transactions as failed_recent even when lastSyncedAt is newer than the activities error', async () => {
    const { classifyItemHealth } = await import('@/lib/sync/health');

    const lastSynced = ts(0.5); // 30 minutes ago
    const resolved = resolveCapabilityTimestamps('snaptrade', lastSynced, {
      ...EMPTY_OPS,
      snaptradeActivitiesFailureAt: ts(2),
      snaptradeActivitiesFailureMessage: 'rate_limit',
      snaptradePositionsSuccessAt: lastSynced,
    });
    const capabilities = buildCapabilityStates(
      ['transactions', 'investments'],
      resolved,
    );
    const verdict = classifyItemHealth({
      provider: 'snaptrade',
      itemStatus: 'active',
      capabilities,
      now: NOW,
    });

    expect(verdict.byCapability.transactions).toBe('failed_recent');
    expect(verdict.byCapability.investments).toBe('fresh');
    // Source-level: one capability working, one failing → degraded
    expect(verdict.state).toBe('degraded');
  });

  // Counter-test: if both activities AND positions failed mid-sync
  // (no per-cap info rows for either), and lastSyncedAt is newer
  // than both errors, source classifies as failed (no success-backed
  // capability remains).
  it('classifies as failed when both per-cap errors exist with no overriding info rows', async () => {
    const { classifyItemHealth } = await import('@/lib/sync/health');

    const lastSynced = ts(0.5);
    const resolved = resolveCapabilityTimestamps('snaptrade', lastSynced, {
      ...EMPTY_OPS,
      snaptradeActivitiesFailureAt: ts(2),
      snaptradeActivitiesFailureMessage: 'rate_limit_a',
      snaptradePositionsFailureAt: ts(2),
      snaptradePositionsFailureMessage: 'rate_limit_p',
    });
    const capabilities = buildCapabilityStates(
      ['transactions', 'investments'],
      resolved,
    );
    const verdict = classifyItemHealth({
      provider: 'snaptrade',
      itemStatus: 'active',
      capabilities,
      now: NOW,
    });

    expect(verdict.byCapability.transactions).toBe('failed_recent');
    expect(verdict.byCapability.investments).toBe('failed_recent');
    expect(verdict.state).toBe('failed');
  });
});

// ─────────────────────────────────────────────────────────────────────
// sync.dispatcher errors (post-review fix)
// ─────────────────────────────────────────────────────────────────────

describe('resolveCapabilityTimestamps — sync.dispatcher errors', () => {
  // Regression for review of 4fd02ef Medium. Manual `syncItemAction`
  // failures log under `op = 'sync.dispatcher'`. Phase 3 must surface
  // these or a user can click "Sync now," see it fail, and the
  // health row stays healthy from the last cron.

  it('Plaid: dispatcher error applies to all 3 nightly capabilities', () => {
    const out = resolveCapabilityTimestamps('plaid', null, {
      ...EMPTY_OPS,
      dispatcherFailureAt: ts(1),
      dispatcherFailureMessage: 'manual sync threw',
    });
    expect(out.transactions.lastFailureAt).toEqual(ts(1));
    expect(out.investments.lastFailureAt).toEqual(ts(1));
    expect(out.recurring.lastFailureAt).toEqual(ts(1));
    expect(out.transactions.lastFailureMessage).toBe('manual sync threw');
  });

  it('SnapTrade: dispatcher error applies to transactions + investments', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      dispatcherFailureAt: ts(1),
      dispatcherFailureMessage: 'manual sync threw',
    });
    expect(out.transactions.lastFailureAt).toEqual(ts(1));
    expect(out.investments.lastFailureAt).toEqual(ts(1));
  });

  it('dispatcher error newer than cron error → dispatcher wins', () => {
    const out = resolveCapabilityTimestamps('plaid', null, {
      ...EMPTY_OPS,
      nightlyFailureAt: ts(10),
      nightlyFailureMessage: 'cron error',
      dispatcherFailureAt: ts(2),
      dispatcherFailureMessage: 'manual error',
    });
    expect(out.transactions.lastFailureAt).toEqual(ts(2));
    expect(out.transactions.lastFailureMessage).toBe('manual error');
  });

  it('cron error newer than dispatcher error → cron wins', () => {
    const out = resolveCapabilityTimestamps('plaid', null, {
      ...EMPTY_OPS,
      nightlyFailureAt: ts(2),
      nightlyFailureMessage: 'cron error',
      dispatcherFailureAt: ts(10),
      dispatcherFailureMessage: 'old manual error',
    });
    expect(out.transactions.lastFailureAt).toEqual(ts(2));
    expect(out.transactions.lastFailureMessage).toBe('cron error');
  });

  it('dispatcher error does NOT apply to balances (separate cron)', () => {
    const out = resolveCapabilityTimestamps('plaid', null, {
      ...EMPTY_OPS,
      dispatcherFailureAt: ts(1),
      dispatcherFailureMessage: 'manual error',
    });
    // Balances reads only from the balance cron — dispatcher errors
    // don't refresh balances. Balance cron is independent.
    expect(out.balances.lastFailureAt).toBeNull();
  });

  it('SnapTrade: dispatcher error + per-capability error → most recent wins per capability', () => {
    const out = resolveCapabilityTimestamps('snaptrade', null, {
      ...EMPTY_OPS,
      dispatcherFailureAt: ts(5),
      dispatcherFailureMessage: 'older dispatcher',
      snaptradeActivitiesFailureAt: ts(1),
      snaptradeActivitiesFailureMessage: 'newer activities',
      snaptradePositionsFailureAt: ts(20),
      snaptradePositionsFailureMessage: 'old positions',
    });
    // Transactions: activities (T1) > dispatcher (T5)
    expect(out.transactions.lastFailureAt).toEqual(ts(1));
    expect(out.transactions.lastFailureMessage).toBe('newer activities');
    // Investments: dispatcher (T5) > positions (T20)
    expect(out.investments.lastFailureAt).toEqual(ts(5));
    expect(out.investments.lastFailureMessage).toBe('older dispatcher');
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
