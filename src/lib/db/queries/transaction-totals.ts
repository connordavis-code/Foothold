import { and, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sourceScopeWhere } from '@/lib/db/source-scope';
import {
  financialAccounts,
  externalItems,
  transactions,
} from '@/lib/db/schema';
import { currentMonthRange } from '@/lib/format/date';

export type MonthlyTransactionTotals = {
  /** Sum of outflow amounts in the current month (Plaid: amount > 0). */
  spend: number;
  /** Sum of inflow amounts in the current month, returned as positive. */
  income: number;
  /** income − spend. Positive when earning > spending this month. */
  net: number;
};

/**
 * Month-to-date Spend / Income / Net for the /transactions KPI strip.
 * Single SQL select with CASE-aggregated SUM(...) so spend and income
 * land in one round trip.
 *
 * EXCLUSION LIST (must stay verbatim in lockstep with
 * `getDashboardSummary.monthSpend`):
 *   - financial_account.type = 'investment' excluded (investment txns
 *     don't reflect cash movement in the user's sense)
 *   - primary_category IN ('TRANSFER_IN','TRANSFER_OUT','LOAN_PAYMENTS')
 *     excluded (structural movements, not real spend/income)
 *   - COALESCE wraps the NOT IN so NULL categories don't filter out
 *     (NULL NOT IN (...) → NULL → falsy; we want them included)
 *
 * INVARIANT: spend MUST equal getDashboardSummary().monthSpend for the
 * same user at the same instant. T8 UAT gate 7 verifies side-by-side.
 */
export async function getMonthlyTransactionTotals(
  userId: string,
): Promise<MonthlyTransactionTotals> {
  const { start, end } = currentMonthRange();

  const [row] = await db
    .select({
      spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric > 0 THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric < 0 THEN -${transactions.amount}::numeric ELSE 0 END), 0)`,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        sourceScopeWhere(userId),
        gte(transactions.date, start),
        lt(transactions.date, end),
        notInArray(financialAccounts.type, ['investment']),
        sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
      ),
    );

  const spend = Number(row?.spend ?? 0);
  const income = Number(row?.income ?? 0);
  return {
    spend,
    income,
    net: income - spend,
  };
}
