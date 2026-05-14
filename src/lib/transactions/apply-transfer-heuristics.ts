import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  externalItems,
  financialAccounts,
  transactions,
} from '@/lib/db/schema';
import {
  findMirrorImageTransferPairs,
  merchantMatchesInvestmentInstitution,
  type CandidateTransaction,
} from './heuristics';

const WINDOW_DAYS = 90;

export type HeuristicResult = {
  mirrorPairs: number;
  merchantMatches: number;
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
    return { mirrorPairs: 0, merchantMatches: 0 };
  }

  const candidates: CandidateTransaction[] = txnRows.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    date: t.date,
    amount: Number(t.amount),
    isTransferOverride: t.isTransferOverride,
  }));

  const pairs = findMirrorImageTransferPairs(candidates);
  const mirrorIds = new Set<string>();
  for (const p of pairs) {
    mirrorIds.add(p.outflowId);
    mirrorIds.add(p.inflowId);
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
      if (
        merchantMatchesInvestmentInstitution(t.merchantName, institutionNames)
      ) {
        merchantIds.add(t.id);
      }
    }
  }

  const allIds = [...mirrorIds, ...merchantIds];
  if (allIds.length === 0) {
    return { mirrorPairs: 0, merchantMatches: 0 };
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
  };
}
