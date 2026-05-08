import { and, desc, eq, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { errorLog, externalItems, financialAccounts } from '@/lib/db/schema';
import {
  type CapabilityClassification,
  type CapabilityState,
  type Provider,
  type SyncCapability,
  type SyncHealthState,
  classifyItemHealth,
} from '@/lib/sync/health';

/**
 * Per-source health view for the /settings panel and /dashboard trust
 * strip. One row per connected `external_item`. State + per-capability
 * breakdown come from `classifyItemHealth` (Phase 2 pure layer); this
 * module is the bridge that materializes the inputs from the database.
 *
 * Shape rationale: every consumer wants both the verdict (state +
 * reason) AND the raw timestamps to render "last balance: 2h ago"
 * style copy. Returning both saves Phase 4 from re-querying.
 */
export type SourceHealth = {
  itemId: string;
  provider: Provider;
  institutionName: string | null;
  state: Exclude<SyncHealthState, 'syncing'>;
  reason: string;
  requiresUserAction: boolean;
  /** Capabilities that apply to this source (excludes `not_applicable`). */
  capabilities: SyncCapability[];
  /** Per-capability classification including `not_applicable` keys. */
  byCapability: Record<SyncCapability, CapabilityClassification>;
  /** Most recent successful sync of any kind across all capabilities. */
  lastSuccessfulSyncAt: Date | null;
  /** Latest `cron.balance_refresh.item` info row. Null if never run. */
  lastBalanceRefreshAt: Date | null;
  /** Resolved per-capability success — see `resolveCapabilityTimestamps`. */
  lastTransactionSyncAt: Date | null;
  lastInvestmentSyncAt: Date | null;
  /** Most recent failure of any kind across all capabilities. */
  lastFailureAt: Date | null;
  /** Message of the most-recent failure (across all capabilities). */
  lastFailureSummary: string | null;
};

/**
 * Pure: derive which capabilities are applicable for a source given
 * its provider and the set of `financial_account.type` values.
 *
 * Plaid:
 *   - balances:     depository OR credit (matches Phase 1's
 *                   `selectRefreshableAccounts` filter)
 *   - transactions: depository OR credit
 *   - investments:  investment
 *   - recurring:    depository OR credit
 *
 * SnapTrade:
 *   - transactions + investments always
 *   - balances + recurring never
 */
export function inferCapabilities(
  provider: Provider,
  accountTypes: string[],
): SyncCapability[] {
  if (provider === 'snaptrade') {
    return ['transactions', 'investments'];
  }

  const types = new Set(accountTypes);
  const hasDepositOrCredit = types.has('depository') || types.has('credit');
  const hasInvestment = types.has('investment');

  const caps: SyncCapability[] = [];
  if (hasDepositOrCredit) caps.push('balances', 'transactions');
  if (hasInvestment) caps.push('investments');
  if (hasDepositOrCredit) caps.push('recurring');
  return caps;
}

/**
 * Raw per-op-class lookups from `error_log`, plus the item's
 * `lastSyncedAt` column. Consumed only by `resolveCapabilityTimestamps`
 * — every other helper works on the resolved per-capability shape.
 */
export type RawOpTimestamps = {
  balanceSuccessAt: Date | null;
  balanceFailureAt: Date | null;
  balanceFailureMessage: string | null;
  nightlySuccessAt: Date | null;
  nightlyFailureAt: Date | null;
  nightlyFailureMessage: string | null;
  /** SnapTrade per-capability errors. Plaid items will have null here. */
  snaptradeActivitiesFailureAt: Date | null;
  snaptradeActivitiesFailureMessage: string | null;
  snaptradePositionsFailureAt: Date | null;
  snaptradePositionsFailureMessage: string | null;
};

/** Per-capability resolved timestamps. Output of `resolveCapabilityTimestamps`. */
export type CapabilityTimestamps = {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureMessage: string | null;
};

export type ResolvedCapabilityTimestamps = Record<
  SyncCapability,
  CapabilityTimestamps
>;

function mostRecent(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function mostRecentFailure(
  a: { at: Date | null; message: string | null },
  b: { at: Date | null; message: string | null },
): { at: Date | null; message: string | null } {
  if (a.at === null) return b;
  if (b.at === null) return a;
  return a.at.getTime() >= b.at.getTime() ? a : b;
}

/**
 * Pure: translate raw op-class log lookups + `external_item.lastSyncedAt`
 * + provider into per-capability resolved success/failure timestamps.
 *
 * This helper owns the load-bearing op-class-to-capability mapping
 * rules. Two non-obvious considerations:
 *
 *   - **lastSyncedAt as fallback for nightly success.** Both manual
 *     and cron syncs update `external_item.lastSyncedAt`, but only
 *     the cron writes `cron.nightly_sync.item` info rows. Without the
 *     fallback, a freshly connected source has lastSyncedAt set but
 *     no info row → health classifies as `unknown`/`never_synced`
 *     until the next nightly cron, which is misleading UX. We take
 *     `max(nightly info row, lastSyncedAt)` so manual / initial syncs
 *     count toward freshness too.
 *
 *   - **SnapTrade per-capability errors.** `syncSnaptradeItem`
 *     intentionally catches per-account position/activity failures
 *     and logs `snaptrade.sync.positions` / `snaptrade.sync.activities`
 *     while the orchestrator-level `cron.nightly_sync.item` still rolls
 *     up as success. Without merging those per-capability errors into
 *     the relevant capability's failure timestamp, partial SnapTrade
 *     failures would silently disappear from source health. We merge
 *     `activities` errors into `transactions` and `positions` errors
 *     into `investments`, taking the most-recent of (cron-level error,
 *     SnapTrade-specific error). Residual limitation: when a partial
 *     failure precedes a successful cron rollup, the success timestamp
 *     is slightly newer and the classifier will say "fresh." Fully
 *     solving that requires per-capability success logging in
 *     `syncSnaptradeItem` (broader scope, deferred).
 *
 * Balance refresh is provider-agnostic at this layer — only the cron
 * writes balance signals and `lastSyncedAt` doesn't reflect balance
 * refreshes. So balances reads straight through from the cron op
 * regardless of provider; for SnapTrade `balances` is N/A anyway.
 */
export function resolveCapabilityTimestamps(
  provider: Provider,
  itemLastSyncedAt: Date | null,
  ops: RawOpTimestamps,
): ResolvedCapabilityTimestamps {
  const balances: CapabilityTimestamps = {
    lastSuccessAt: ops.balanceSuccessAt,
    lastFailureAt: ops.balanceFailureAt,
    lastFailureMessage: ops.balanceFailureMessage,
  };

  // Nightly success: max(cron info row, item.lastSyncedAt). The
  // fallback lets manual / initial syncs count.
  const nightlySuccess = mostRecent(ops.nightlySuccessAt, itemLastSyncedAt);

  if (provider === 'plaid') {
    // Plaid nightly is atomic. One failure source covers all nightly
    // capabilities.
    const nightly: CapabilityTimestamps = {
      lastSuccessAt: nightlySuccess,
      lastFailureAt: ops.nightlyFailureAt,
      lastFailureMessage: ops.nightlyFailureMessage,
    };
    return {
      balances,
      transactions: nightly,
      investments: nightly,
      recurring: nightly,
    };
  }

  // SnapTrade: merge per-capability errors with orchestrator-level
  // failures. activities → transactions; positions → investments.
  const txFailure = mostRecentFailure(
    { at: ops.nightlyFailureAt, message: ops.nightlyFailureMessage },
    {
      at: ops.snaptradeActivitiesFailureAt,
      message: ops.snaptradeActivitiesFailureMessage,
    },
  );
  const invFailure = mostRecentFailure(
    { at: ops.nightlyFailureAt, message: ops.nightlyFailureMessage },
    {
      at: ops.snaptradePositionsFailureAt,
      message: ops.snaptradePositionsFailureMessage,
    },
  );

  return {
    balances, // N/A for SnapTrade — buildCapabilityStates emits not_applicable
    transactions: {
      lastSuccessAt: nightlySuccess,
      lastFailureAt: txFailure.at,
      lastFailureMessage: txFailure.message,
    },
    investments: {
      lastSuccessAt: nightlySuccess,
      lastFailureAt: invFailure.at,
      lastFailureMessage: invFailure.message,
    },
    recurring: {
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureMessage: null,
    }, // N/A for SnapTrade
  };
}

/**
 * Pure: translate per-capability resolved timestamps into the
 * `Record<SyncCapability, CapabilityState>` shape consumed by
 * `classifyItemHealth`. Capabilities not in `applicable` are emitted
 * as `not_applicable` regardless of incoming timestamps.
 */
export function buildCapabilityStates(
  applicable: SyncCapability[],
  resolved: ResolvedCapabilityTimestamps,
): Record<SyncCapability, CapabilityState> {
  const set = new Set(applicable);
  const out: Record<SyncCapability, CapabilityState> = {
    balances: { kind: 'not_applicable' },
    transactions: { kind: 'not_applicable' },
    investments: { kind: 'not_applicable' },
    recurring: { kind: 'not_applicable' },
  };
  for (const cap of [
    'balances',
    'transactions',
    'investments',
    'recurring',
  ] as const) {
    if (!set.has(cap)) continue;
    const r = resolved[cap];
    out[cap] = {
      kind: 'tracked',
      lastSuccessAt: r.lastSuccessAt,
      lastFailureAt: r.lastFailureAt,
      lastFailureSummary: r.lastFailureMessage,
    };
  }
  return out;
}

/**
 * Pure: aggregate per-capability resolved timestamps into top-level
 * "last success" and "last failure" scalars. `lastFailureSummary`
 * carries the message of whichever failure is most recent across
 * all capabilities.
 */
export function aggregateTopLevelTimestamps(
  resolved: ResolvedCapabilityTimestamps,
): {
  lastSuccessfulSyncAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureSummary: string | null;
} {
  const successCandidates = Object.values(resolved)
    .map((r) => r.lastSuccessAt)
    .filter((d): d is Date => d !== null);
  const lastSuccessfulSyncAt =
    successCandidates.length === 0
      ? null
      : new Date(Math.max(...successCandidates.map((d) => d.getTime())));

  const failureCandidates = Object.values(resolved)
    .map((r) =>
      r.lastFailureAt
        ? { at: r.lastFailureAt, message: r.lastFailureMessage }
        : null,
    )
    .filter(
      (f): f is { at: Date; message: string | null } => f !== null,
    );
  failureCandidates.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Dedup identical (at, message) tuples that arise when Plaid's
  // single nightly failure shows up across transactions/investments/
  // recurring — we still want a single top-level failure entry.
  const lastFailure = failureCandidates[0] ?? null;

  return {
    lastSuccessfulSyncAt,
    lastFailureAt: lastFailure?.at ?? null,
    lastFailureSummary: lastFailure?.message ?? null,
  };
}

async function loadOpTimestamps(itemId: string): Promise<RawOpTimestamps> {
  const [
    balSucc,
    balFail,
    nightSucc,
    nightFail,
    stActFail,
    stPosFail,
  ] = await Promise.all([
    db
      .select({ at: errorLog.occurredAt })
      .from(errorLog)
      .where(
        and(
          eq(errorLog.externalItemId, itemId),
          eq(errorLog.op, 'cron.balance_refresh.item'),
          eq(errorLog.level, 'info'),
        ),
      )
      .orderBy(desc(errorLog.occurredAt))
      .limit(1),
    db
      .select({ at: errorLog.occurredAt, message: errorLog.message })
      .from(errorLog)
      .where(
        and(
          eq(errorLog.externalItemId, itemId),
          like(errorLog.op, 'cron.balance_refresh%'),
          eq(errorLog.level, 'error'),
        ),
      )
      .orderBy(desc(errorLog.occurredAt))
      .limit(1),
    db
      .select({ at: errorLog.occurredAt })
      .from(errorLog)
      .where(
        and(
          eq(errorLog.externalItemId, itemId),
          eq(errorLog.op, 'cron.nightly_sync.item'),
          eq(errorLog.level, 'info'),
        ),
      )
      .orderBy(desc(errorLog.occurredAt))
      .limit(1),
    db
      .select({ at: errorLog.occurredAt, message: errorLog.message })
      .from(errorLog)
      .where(
        and(
          eq(errorLog.externalItemId, itemId),
          like(errorLog.op, 'cron.nightly_sync%'),
          eq(errorLog.level, 'error'),
        ),
      )
      .orderBy(desc(errorLog.occurredAt))
      .limit(1),
    db
      .select({ at: errorLog.occurredAt, message: errorLog.message })
      .from(errorLog)
      .where(
        and(
          eq(errorLog.externalItemId, itemId),
          eq(errorLog.op, 'snaptrade.sync.activities'),
          eq(errorLog.level, 'error'),
        ),
      )
      .orderBy(desc(errorLog.occurredAt))
      .limit(1),
    db
      .select({ at: errorLog.occurredAt, message: errorLog.message })
      .from(errorLog)
      .where(
        and(
          eq(errorLog.externalItemId, itemId),
          eq(errorLog.op, 'snaptrade.sync.positions'),
          eq(errorLog.level, 'error'),
        ),
      )
      .orderBy(desc(errorLog.occurredAt))
      .limit(1),
  ]);

  return {
    balanceSuccessAt: balSucc[0]?.at ?? null,
    balanceFailureAt: balFail[0]?.at ?? null,
    balanceFailureMessage: balFail[0]?.message ?? null,
    nightlySuccessAt: nightSucc[0]?.at ?? null,
    nightlyFailureAt: nightFail[0]?.at ?? null,
    nightlyFailureMessage: nightFail[0]?.message ?? null,
    snaptradeActivitiesFailureAt: stActFail[0]?.at ?? null,
    snaptradeActivitiesFailureMessage: stActFail[0]?.message ?? null,
    snaptradePositionsFailureAt: stPosFail[0]?.at ?? null,
    snaptradePositionsFailureMessage: stPosFail[0]?.message ?? null,
  };
}

/**
 * Per-source health for `userId`. Returns one row per connected
 * `external_item`, ordered by creation date so the UI's row order is
 * stable across reloads.
 *
 * Query shape: 1 typed Drizzle query for items+aggregated account
 * types, then 6 parallel `error_log` lookups per item (success+failure
 * for balance + nightly, plus snaptrade per-capability error ops).
 * Composite index on `error_log(external_item_id, op, occurred_at)`
 * keeps each lookup at O(log N) index seek + LIMIT 1.
 *
 * No secret material is exposed — `external_item.secret` is never
 * selected.
 */
export async function getSourceHealth(userId: string): Promise<SourceHealth[]> {
  const items = await db
    .select({
      id: externalItems.id,
      provider: externalItems.provider,
      institutionName: externalItems.institutionName,
      status: externalItems.status,
      lastSyncedAt: externalItems.lastSyncedAt,
      createdAt: externalItems.createdAt,
      accountTypes: sql<
        string[] | null
      >`ARRAY_AGG(DISTINCT ${financialAccounts.type}) FILTER (WHERE ${financialAccounts.type} IS NOT NULL)`,
    })
    .from(externalItems)
    .leftJoin(
      financialAccounts,
      eq(financialAccounts.itemId, externalItems.id),
    )
    .where(eq(externalItems.userId, userId))
    .groupBy(
      externalItems.id,
      externalItems.provider,
      externalItems.institutionName,
      externalItems.status,
      externalItems.lastSyncedAt,
      externalItems.createdAt,
    )
    .orderBy(externalItems.createdAt);

  const now = new Date();

  return Promise.all(
    items.map(async (item): Promise<SourceHealth> => {
      const provider = item.provider as Provider;
      const accountTypes = item.accountTypes ?? [];
      const applicable = inferCapabilities(provider, accountTypes);
      const ops = await loadOpTimestamps(item.id);
      const resolved = resolveCapabilityTimestamps(
        provider,
        item.lastSyncedAt,
        ops,
      );
      const capabilities = buildCapabilityStates(applicable, resolved);
      const verdict = classifyItemHealth({
        provider,
        itemStatus: item.status,
        capabilities,
        now,
      });
      const aggregate = aggregateTopLevelTimestamps(resolved);

      return {
        itemId: item.id,
        provider,
        institutionName: item.institutionName,
        state: verdict.state,
        reason: verdict.reason,
        requiresUserAction: verdict.requiresUserAction,
        capabilities: applicable,
        byCapability: verdict.byCapability,
        lastSuccessfulSyncAt: aggregate.lastSuccessfulSyncAt,
        lastBalanceRefreshAt: resolved.balances.lastSuccessAt,
        lastTransactionSyncAt: resolved.transactions.lastSuccessAt,
        lastInvestmentSyncAt: resolved.investments.lastSuccessAt,
        lastFailureAt: aggregate.lastFailureAt,
        lastFailureSummary: aggregate.lastFailureSummary,
      };
    }),
  );
}
