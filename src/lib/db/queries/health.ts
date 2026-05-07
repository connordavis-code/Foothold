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
  /** Most recent successful sync of any kind across all op classes. */
  lastSuccessfulSyncAt: Date | null;
  /** Latest `cron.balance_refresh.item` info row. Null if never run. */
  lastBalanceRefreshAt: Date | null;
  /** Latest `cron.nightly_sync.item` info row (transactions side). */
  lastTransactionSyncAt: Date | null;
  /**
   * Latest `cron.nightly_sync.item` info row (investments side). Today
   * identical to `lastTransactionSyncAt` because transactions and
   * investments share the nightly cron's per-item op; preserved as a
   * separate field so a future per-capability success log split
   * doesn't break consumers.
   */
  lastInvestmentSyncAt: Date | null;
  /** Most recent failure of any kind across all op classes. */
  lastFailureAt: Date | null;
  /** Message of the most-recent failure (across all op classes). */
  lastFailureSummary: string | null;
};

/**
 * Pure: derive which capabilities are applicable for a source given
 * its provider and the set of `financial_account.type` values.
 *
 * Plaid:
 *   - balances:     depository OR credit (matches Phase 1's
 *                   `selectRefreshableAccounts` filter — investments
 *                   refresh via holdings, loans not supported today)
 *   - transactions: depository OR credit (regular transactions stream)
 *   - investments:  investment (holdings + investment_transactions)
 *   - recurring:    depository OR credit (Plaid's recurring detector
 *                   runs on regular transactions)
 *
 * SnapTrade:
 *   - transactions + investments always (brokerages always sync
 *     accounts → positions → activities). Account types are not used
 *     because SnapTrade brokerages map onto a fixed capability set.
 *   - balances + recurring never (no separate balance refresh path;
 *     brokerages don't have recurring streams).
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
 * Raw per-item timestamps assembled from `error_log` lookups.
 *
 * Today's mapping:
 *   balance success: `op = 'cron.balance_refresh.item' AND level='info'`
 *   balance failure: `op LIKE 'cron.balance_refresh%' AND level='error'`
 *   nightly success: `op = 'cron.nightly_sync.item' AND level='info'`
 *   nightly failure: `op LIKE 'cron.nightly_sync%' AND level='error'`
 *
 * `cron.balance_refresh.skipped` rows (Phase 1) are intentionally NOT
 * read here. Capability applicability is already inferred from
 * `financial_account.type`, so an item that legitimately skips refresh
 * (zero depository/credit accounts) will have `balances` classified as
 * `not_applicable` regardless of skipped-log presence.
 */
export type RawTimestamps = {
  lastBalanceSuccessAt: Date | null;
  lastBalanceFailureAt: Date | null;
  lastBalanceFailureMessage: string | null;
  lastNightlySuccessAt: Date | null;
  lastNightlyFailureAt: Date | null;
  lastNightlyFailureMessage: string | null;
};

/**
 * Pure: translate raw per-op-class timestamps into the per-capability
 * `CapabilityState` record consumed by `classifyItemHealth`.
 *
 * - `balances` reads from balance-refresh timestamps
 * - `transactions`, `investments`, `recurring` share nightly-sync
 *   timestamps (single per-item info row covers all three until
 *   per-capability success logs are added)
 * - capabilities not in `applicable` are emitted as `not_applicable`
 */
export function buildCapabilityStates(
  applicable: SyncCapability[],
  raw: RawTimestamps,
): Record<SyncCapability, CapabilityState> {
  const set = new Set(applicable);

  const balancesState: CapabilityState = set.has('balances')
    ? {
        kind: 'tracked',
        lastSuccessAt: raw.lastBalanceSuccessAt,
        lastFailureAt: raw.lastBalanceFailureAt,
        lastFailureSummary: raw.lastBalanceFailureMessage,
      }
    : { kind: 'not_applicable' };

  const nightlyTracked: CapabilityState = {
    kind: 'tracked',
    lastSuccessAt: raw.lastNightlySuccessAt,
    lastFailureAt: raw.lastNightlyFailureAt,
    lastFailureSummary: raw.lastNightlyFailureMessage,
  };

  return {
    balances: balancesState,
    transactions: set.has('transactions')
      ? nightlyTracked
      : { kind: 'not_applicable' },
    investments: set.has('investments')
      ? nightlyTracked
      : { kind: 'not_applicable' },
    recurring: set.has('recurring')
      ? nightlyTracked
      : { kind: 'not_applicable' },
  };
}

/**
 * Pure: aggregate top-level "last success" and "last failure" from
 * the raw per-op-class timestamps. `lastFailureSummary` carries the
 * message of whichever failure is more recent.
 */
export function aggregateTopLevelTimestamps(raw: RawTimestamps): {
  lastSuccessfulSyncAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureSummary: string | null;
} {
  const successCandidates = [
    raw.lastBalanceSuccessAt,
    raw.lastNightlySuccessAt,
  ].filter((d): d is Date => d !== null);
  const lastSuccessfulSyncAt =
    successCandidates.length === 0
      ? null
      : new Date(Math.max(...successCandidates.map((d) => d.getTime())));

  const failureCandidates = [
    raw.lastBalanceFailureAt
      ? {
          at: raw.lastBalanceFailureAt,
          message: raw.lastBalanceFailureMessage,
        }
      : null,
    raw.lastNightlyFailureAt
      ? {
          at: raw.lastNightlyFailureAt,
          message: raw.lastNightlyFailureMessage,
        }
      : null,
  ].filter(
    (f): f is { at: Date; message: string | null } => f !== null,
  );
  failureCandidates.sort((a, b) => b.at.getTime() - a.at.getTime());
  const lastFailure = failureCandidates[0] ?? null;

  return {
    lastSuccessfulSyncAt,
    lastFailureAt: lastFailure?.at ?? null,
    lastFailureSummary: lastFailure?.message ?? null,
  };
}

async function loadItemTimestamps(itemId: string): Promise<RawTimestamps> {
  const [balSucc, balFail, nightSucc, nightFail] = await Promise.all([
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
  ]);

  return {
    lastBalanceSuccessAt: balSucc[0]?.at ?? null,
    lastBalanceFailureAt: balFail[0]?.at ?? null,
    lastBalanceFailureMessage: balFail[0]?.message ?? null,
    lastNightlySuccessAt: nightSucc[0]?.at ?? null,
    lastNightlyFailureAt: nightFail[0]?.at ?? null,
    lastNightlyFailureMessage: nightFail[0]?.message ?? null,
  };
}

/**
 * Per-source health for `userId`. Returns one row per connected
 * `external_item`, ordered by creation date so the UI's row order is
 * stable across reloads.
 *
 * Query shape: 1 typed Drizzle query for items+aggregated account
 * types, then 4 parallel `error_log` lookups per item. Composite
 * index on `error_log(external_item_id, op, occurred_at)` keeps each
 * lookup at O(log N) index seek + LIMIT 1. For typical N=2–5 sources
 * per user, total round-trip is negligible against the page-load
 * budget.
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
      const raw = await loadItemTimestamps(item.id);
      const capabilities = buildCapabilityStates(applicable, raw);
      const verdict = classifyItemHealth({
        provider,
        itemStatus: item.status,
        capabilities,
        now,
      });
      const aggregate = aggregateTopLevelTimestamps(raw);

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
        lastBalanceRefreshAt: raw.lastBalanceSuccessAt,
        lastTransactionSyncAt: raw.lastNightlySuccessAt,
        lastInvestmentSyncAt: raw.lastNightlySuccessAt,
        lastFailureAt: aggregate.lastFailureAt,
        lastFailureSummary: aggregate.lastFailureSummary,
      };
    }),
  );
}
