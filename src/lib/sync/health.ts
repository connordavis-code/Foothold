/**
 * Sync health classification.
 *
 * Pure data-only helpers that take a snapshot of an external_item's
 * sync state and return a single health verdict + a per-capability
 * breakdown for UI to render. No DB access, no React, no provider
 * SDK calls — every input is materialized at the call site (Phase 3
 * `getSourceHealth` query) so this module stays trivially testable.
 *
 * The model is built around three load-bearing distinctions:
 *
 *   1. `failed` vs `degraded` vs `not_applicable`. A SnapTrade item
 *      doesn't have a balance refresh capability — that should NOT
 *      drag overall state to `stale` just because no balance refresh
 *      ever ran. `not_applicable` capabilities are excluded from the
 *      aggregate. `degraded` requires that at least one capability is
 *      success-backed (fresh or stale) — i.e. there really IS some
 *      working data. If any capability has failed and every other
 *      applicable capability is either also failing OR has never
 *      synced, the source is classified `failed`, not `degraded` —
 *      "no signal" is not "working."
 *
 *   2. `never_synced` vs `stale`. A brand-new item that hasn't run a
 *      cron yet has no signal at all — that's `unknown`, not `stale`.
 *      Once we have at least one success-or-failure datapoint, age
 *      thresholds apply.
 *
 *   3. `needs_reconnect` outranks everything else. If the item state
 *      reports the user must act, no amount of "transactions are
 *      fresh" should hide that — the user has work to do before the
 *      sources can refresh again.
 *
 * Provider freshness windows differ. Plaid runs a 6-hour balance
 * cron; SnapTrade doesn't refresh balances live (positions carry the
 * balance, cached daily by SnapTrade). The policy table encodes which
 * (provider, capability) pairs are tracked at all, and any tracked
 * input passed for an untracked capability is defensively classified
 * as `not_applicable` so a Phase 3 misclassification can't degrade
 * the headline.
 */

export type Provider = 'plaid' | 'snaptrade';

export type SyncHealthState =
  | 'healthy'
  | 'syncing'
  | 'stale'
  | 'degraded'
  | 'needs_reconnect'
  | 'failed'
  | 'unknown';

export type SyncCapability =
  | 'balances'
  | 'transactions'
  | 'investments'
  | 'recurring';

export type CapabilityClassification =
  | 'not_applicable'
  | 'fresh'
  | 'stale'
  | 'failed_recent'
  | 'never_synced';

export type CapabilityState =
  | { kind: 'not_applicable' }
  | {
      kind: 'tracked';
      lastSuccessAt: Date | null;
      lastFailureAt: Date | null;
      lastFailureSummary?: string | null;
    };

export type ClassifyInput = {
  provider: Provider;
  /** Raw `external_item.status`. Anything other than `active` is treated as needs_reconnect. */
  itemStatus: string;
  capabilities: Record<SyncCapability, CapabilityState>;
  now: Date;
};

export type ClassifyOutput = {
  /** `syncing` is set by the caller during in-flight manual syncs; never returned by this helper. */
  state: Exclude<SyncHealthState, 'syncing'>;
  requiresUserAction: boolean;
  reason: string;
  byCapability: Record<SyncCapability, CapabilityClassification>;
};

/**
 * Provider × capability freshness windows. Absence of a key means the
 * capability does not apply for that provider (e.g. SnapTrade balances —
 * holdings sync carries balance, no separate refresh path; brokerages
 * don't have recurring streams).
 *
 * Plaid windows include slack for one missed cron run:
 *   balances 12h     — 6h schedule + 1 miss
 *   transactions 36h — nightly + 1 miss
 *   investments 36h  — nightly + 1 miss
 *   recurring 36h    — derived from nightly transactions sync
 *
 * SnapTrade windows match Plaid's nightly cadence; the upstream
 * SnapTrade daily-cache is the real ceiling for any "fresher" claim.
 */
export const FRESHNESS_POLICY: Record<
  Provider,
  Partial<Record<SyncCapability, { staleHours: number }>>
> = {
  plaid: {
    balances: { staleHours: 12 },
    transactions: { staleHours: 36 },
    investments: { staleHours: 36 },
    recurring: { staleHours: 36 },
  },
  snaptrade: {
    transactions: { staleHours: 36 },
    investments: { staleHours: 36 },
  },
};

const HOUR_MS = 60 * 60 * 1000;

function classifyCapability(
  state: CapabilityState,
  policy: { staleHours: number } | undefined,
  now: Date,
): CapabilityClassification {
  // Defensive: if Phase 3 sends `tracked` for a capability with no
  // policy (e.g. SnapTrade balances), treat it as not_applicable
  // rather than letting a Phase 3 bug degrade the headline.
  if (state.kind === 'not_applicable' || !policy) return 'not_applicable';

  const { lastSuccessAt, lastFailureAt } = state;

  if (lastSuccessAt === null && lastFailureAt === null) {
    return 'never_synced';
  }

  const successMs = lastSuccessAt?.getTime() ?? -Infinity;
  const failureMs = lastFailureAt?.getTime() ?? -Infinity;

  // Failure newer than the last success → acute failure. A success
  // newer than a prior failure means the item recovered — the failure
  // is no longer load-bearing.
  if (failureMs > successMs) return 'failed_recent';

  const ageMs = now.getTime() - successMs;
  const staleMs = policy.staleHours * HOUR_MS;
  return ageMs > staleMs ? 'stale' : 'fresh';
}

/**
 * Open question for Phase 3+: `external_item.status = 'error'` is
 * Plaid's catch-all for ITEM_ERROR. It can mean user-actionable
 * (rare reauth-flavored states) OR engineering-actionable (transient
 * provider failure, rate limit, upstream outage). Today we treat all
 * non-active statuses identically — `needs_reconnect` with
 * `requiresUserAction: true`. That's fail-closed: better to surface
 * attention than mask a real issue. Once Phase 3+ has real
 * `error_log` data, we can decide whether `error` should split into
 * a separate state with `requiresUserAction: false`, or whether
 * callers should narrow it from `lastFailureSummary` content.
 */
function describeStatus(status: string): string {
  switch (status) {
    case 'login_required':
      return 'Reconnect required (login)';
    case 'permission_revoked':
      return 'Reconnect required (permission revoked)';
    case 'pending_expiration':
      return 'Reauth pending (will expire soon)';
    case 'error':
      return 'Provider reported error';
    default:
      return `Provider reported unrecognized status: ${status}`;
  }
}

function collectFailureSummaries(
  capabilities: Record<SyncCapability, CapabilityState>,
  byCapability: Record<SyncCapability, CapabilityClassification>,
): string[] {
  const summaries: string[] = [];
  for (const cap of Object.keys(byCapability) as SyncCapability[]) {
    if (byCapability[cap] !== 'failed_recent') continue;
    const state = capabilities[cap];
    if (state.kind === 'tracked' && state.lastFailureSummary) {
      summaries.push(`${cap}: ${state.lastFailureSummary}`);
    }
  }
  return summaries;
}

export function classifyItemHealth(input: ClassifyInput): ClassifyOutput {
  const { provider, itemStatus, capabilities, now } = input;
  const policies = FRESHNESS_POLICY[provider];

  const byCapability: Record<SyncCapability, CapabilityClassification> = {
    balances: classifyCapability(
      capabilities.balances,
      policies.balances,
      now,
    ),
    transactions: classifyCapability(
      capabilities.transactions,
      policies.transactions,
      now,
    ),
    investments: classifyCapability(
      capabilities.investments,
      policies.investments,
      now,
    ),
    recurring: classifyCapability(
      capabilities.recurring,
      policies.recurring,
      now,
    ),
  };

  // needs_reconnect outranks every capability classification — the
  // user has to act before sources can refresh.
  if (itemStatus !== 'active') {
    return {
      state: 'needs_reconnect',
      requiresUserAction: true,
      reason: describeStatus(itemStatus),
      byCapability,
    };
  }

  let applicable = 0;
  let fresh = 0;
  let stale = 0;
  let failed = 0;
  let neverSynced = 0;

  for (const c of Object.values(byCapability)) {
    if (c === 'not_applicable') continue;
    applicable++;
    if (c === 'fresh') fresh++;
    else if (c === 'stale') stale++;
    else if (c === 'failed_recent') failed++;
    else if (c === 'never_synced') neverSynced++;
  }

  if (applicable === 0) {
    return {
      state: 'unknown',
      requiresUserAction: false,
      reason: 'No applicable capabilities for this provider',
      byCapability,
    };
  }

  // Brand-new connection: every applicable capability has neither a
  // success nor a failure on record. `unknown` is more honest than
  // `stale` — we have no signal, not "old signal".
  if (neverSynced === applicable) {
    return {
      state: 'unknown',
      requiresUserAction: false,
      reason: 'No sync data yet',
      byCapability,
    };
  }

  if (failed > 0) {
    const summaries = collectFailureSummaries(capabilities, byCapability);
    const summarySuffix =
      summaries.length > 0 ? ` — ${summaries.join('; ')}` : '';

    // `degraded` is reserved for "some failing + some success-backed."
    // `never_synced` is NOT success-backed — it's no signal at all,
    // not a working capability. Failed + only never_synced therefore
    // classifies as `failed`: there's an acute failure and zero useful
    // data on this source. Fail closed for the trust surface.
    const successBacked = fresh + stale;

    if (successBacked === 0) {
      return {
        state: 'failed',
        requiresUserAction: false,
        reason:
          failed === applicable
            ? `All ${applicable} applicable capabilities failing${summarySuffix}`
            : `${failed} of ${applicable} capabilities failing; remainder never synced${summarySuffix}`,
        byCapability,
      };
    }

    return {
      state: 'degraded',
      requiresUserAction: false,
      reason: `${failed} of ${applicable} capabilities failing${summarySuffix}`,
      byCapability,
    };
  }

  if (fresh === applicable) {
    return {
      state: 'healthy',
      requiresUserAction: false,
      reason: 'All applicable capabilities fresh',
      byCapability,
    };
  }

  const notFresh = stale + neverSynced;
  return {
    state: 'stale',
    requiresUserAction: false,
    reason:
      stale > 0
        ? `${notFresh} of ${applicable} capabilities not fresh`
        : `${neverSynced} of ${applicable} capabilities never synced`,
    byCapability,
  };
}
