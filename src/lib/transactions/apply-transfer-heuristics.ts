import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  externalItems,
  financialAccounts,
  transactions,
} from '@/lib/db/schema';
import {
  findMatchedInvestmentInstitution,
  findMirrorImageTransferPairs,
  type CandidateTransaction,
} from './heuristics';

/**
 * Bounded by what the forecast actually reads. `computeBaseline` in
 * src/lib/forecast/ projects outflows as `sum(median(PFC trailing 3
 * complete months))` — anything older than that window cannot move
 * a number any user sees on /dashboard or /simulator.
 *
 * 90 days is the rolling-window approximation that always covers the
 * 3-complete-months calendar window the forecast consumes (and a few
 * days of pre-current-month buffer). Smaller windows would risk gaps
 * at month edges; larger windows would burn O(n²) cycles on rows whose
 * classification can't reach any UI surface anyway.
 *
 * Older mis-classified transfers stay mis-classified until the user
 * manually marks them via the DetailSheet (Phase 1b/2). That's a
 * deliberate floor — heuristics earn their place by cleaning up the
 * window we actually compute against; everything older is in the
 * "manual only" trust tier.
 */
const WINDOW_DAYS = 90;

/**
 * Per-match detail emitted to error_log on every sync that auto-marks
 * at least one transaction. Lets the user (and future-me) inspect
 * exactly which rows fired which rule without poking at the DB — the
 * dispatcher writes this array under context.details for the
 * `sync.heuristics.transfer-override` op. Survives until the next
 * matching sync overwrites it, and stays queryable indefinitely:
 *
 *   SELECT context FROM error_log
 *   WHERE op = 'sync.heuristics.transfer-override'
 *   ORDER BY occurred_at DESC LIMIT 1;
 */
export type HeuristicMatchDetail =
  | {
      txnId: string;
      rule: 'mirror-image';
      merchantName: string | null;
      amount: number;
      date: string;
      /** The id of the opposite leg this row was paired with. */
      pairedWith: string;
    }
  | {
      txnId: string;
      rule: 'institution-match';
      merchantName: string | null;
      amount: number;
      date: string;
      /** The investment institution name whose normalized form matched. */
      matchedInstitution: string;
    };

export type HeuristicResult = {
  mirrorPairs: number;
  merchantMatches: number;
  details: HeuristicMatchDetail[];
};

/**
 * Sync-time auto-classification of internal transfers.
 *
 * Runs both Phase 1c heuristics over the user's trailing-90-day
 * transactions and writes is_transfer_override=true on every match.
 * Only touches rows where is_transfer_override IS NULL — manual user
 * overrides (true or false) are inviolable. A concurrent user write
 * during the heuristic pass is race-safe because the UPDATE's WHERE
 * clause re-asserts IS NULL.
 *
 * Window is bounded at 90 days because the cash forecast only consumes
 * the trailing 3 complete months — older mirror-image pairs can't
 * change a projected number anyone reads.
 */
export async function applyTransferHeuristics(
  userId: string,
): Promise<HeuristicResult> {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const txnRows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      merchantName: transactions.merchantName,
      isTransferOverride: transactions.isTransferOverride,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(transactions.accountId, financialAccounts.id),
    )
    .innerJoin(externalItems, eq(financialAccounts.itemId, externalItems.id))
    .where(
      and(
        eq(externalItems.userId, userId),
        isNull(transactions.isTransferOverride),
        gte(transactions.date, windowStartIso),
      ),
    );

  if (txnRows.length === 0) {
    return { mirrorPairs: 0, merchantMatches: 0, details: [] };
  }

  const candidates: CandidateTransaction[] = txnRows.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    date: t.date,
    amount: Number(t.amount),
    isTransferOverride: t.isTransferOverride,
  }));
  const txnById = new Map(txnRows.map((t) => [t.id, t]));

  const pairs = findMirrorImageTransferPairs(candidates);
  const mirrorIds = new Set<string>();
  const details: HeuristicMatchDetail[] = [];
  for (const pair of pairs) {
    mirrorIds.add(pair.outflowId);
    mirrorIds.add(pair.inflowId);
    const out = txnById.get(pair.outflowId);
    const inflow = txnById.get(pair.inflowId);
    if (out) {
      details.push({
        txnId: out.id,
        rule: 'mirror-image',
        merchantName: out.merchantName,
        amount: Number(out.amount),
        date: out.date,
        pairedWith: pair.inflowId,
      });
    }
    if (inflow) {
      details.push({
        txnId: inflow.id,
        rule: 'mirror-image',
        merchantName: inflow.merchantName,
        amount: Number(inflow.amount),
        date: inflow.date,
        pairedWith: pair.outflowId,
      });
    }
  }

  const institutionRows = await db
    .selectDistinct({ institutionName: externalItems.institutionName })
    .from(externalItems)
    .innerJoin(
      financialAccounts,
      eq(externalItems.id, financialAccounts.itemId),
    )
    .where(
      and(
        eq(externalItems.userId, userId),
        eq(financialAccounts.type, 'investment'),
      ),
    );
  const institutionNames = institutionRows
    .map((r) => r.institutionName)
    .filter((n): n is string => Boolean(n));

  const merchantIds = new Set<string>();
  if (institutionNames.length > 0) {
    for (const t of txnRows) {
      if (mirrorIds.has(t.id)) continue;
      if (Number(t.amount) <= 0) continue;
      const matchedInstitution = findMatchedInvestmentInstitution(
        t.merchantName,
        institutionNames,
      );
      if (matchedInstitution !== null) {
        merchantIds.add(t.id);
        details.push({
          txnId: t.id,
          rule: 'institution-match',
          merchantName: t.merchantName,
          amount: Number(t.amount),
          date: t.date,
          matchedInstitution,
        });
      }
    }
  }

  const allIds = [...mirrorIds, ...merchantIds];
  if (allIds.length === 0) {
    return { mirrorPairs: 0, merchantMatches: 0, details: [] };
  }

  await db
    .update(transactions)
    .set({ isTransferOverride: true, updatedAt: new Date() })
    .where(
      and(
        inArray(transactions.id, allIds),
        isNull(transactions.isTransferOverride),
      ),
    );

  return {
    mirrorPairs: pairs.length,
    merchantMatches: merchantIds.size,
    details,
  };
}
