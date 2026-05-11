import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  externalItems,
  financialAccounts,
  transactions,
} from '@/lib/db/schema';
import { pickTopDiscretionaryCategory } from '@/lib/goals/discretionary';
import { getDriftAnalysis } from './drift';

/*
 * R.3.1 trimmed this module from ~475 lines down to the two functions
 * still consumed after /goals/[id] deletion. Previously housed:
 *   - getGoalDetail (single-goal lookup; only the deleted detail page
 *     consumed it)
 *   - getGoalTrajectory + GoalTrajectory type (only the deleted
 *     trajectory chart consumed them; walkBackTrajectory pure helper
 *     deleted alongside in src/lib/goals/trajectory.ts)
 *   - getContributingFeed + SpendCapFeedRow / SavingsFeedRow /
 *     GoalContributingFeed (only the deleted feed components consumed
 *     them)
 *
 * Surviving exports support /goals' card-list coaching path:
 *   - getBehindSavingsCoachingCategory — drift-first / median-fallback
 *     category source for the savings-behind coaching action sentence
 *   - getTopDiscretionaryCategory — fallback path; also exported in
 *     case future surfaces want the median-only path
 *   - TopDiscretionaryCategory type — return shape
 *
 * Git history preserves the deleted code: `git log --diff-filter=D --
 *   src/lib/db/queries/goal-detail.ts` finds the R.3.1 commit.
 */

export type TopDiscretionaryCategory = {
  /** PFC enum, humanized form expected by composeCoaching's action template. */
  name: string;
  /** Median across 3 complete trailing months (zero-filled). */
  monthlyAmount: number;
};

/**
 * Largest non-recurring outflow category by median across the 3 complete
 * trailing months, excluding transfers and loan payments. Used as the
 * fallback source for behind-savings coaching actions when /drift has
 * nothing currently flagged.
 *
 * Window deliberately EXCLUDES the partial current month — a half-month
 * of spending shouldn't compete with full-month historical buckets.
 * Median-not-mean across the 3 month buckets so a single big-ticket
 * month doesn't dominate. Pure bucketing/median math lives in
 * pickTopDiscretionaryCategory.
 */
export async function getTopDiscretionaryCategory(
  userId: string,
): Promise<TopDiscretionaryCategory | null> {
  const today = new Date();
  const monthStartFor = (offset: number) =>
    new Date(today.getFullYear(), today.getMonth() - offset, 1);
  const windowStart = monthStartFor(3).toISOString().slice(0, 10);
  const windowEnd = monthStartFor(0).toISOString().slice(0, 10); // exclusive
  const monthBuckets = [
    monthStartFor(3),
    monthStartFor(2),
    monthStartFor(1),
  ].map(
    (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
  );

  const rows = await db
    .select({
      category: transactions.primaryCategory,
      ym: sql<string>`to_char(${transactions.date}::date, 'YYYY-MM')`,
      monthTotal: sql<string>`SUM(${transactions.amount}::numeric)`,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, userId),
        gte(transactions.date, windowStart),
        sql`${transactions.date} < ${windowEnd}`,
        sql`${transactions.amount}::numeric > 0`,
        sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
      ),
    )
    .groupBy(
      transactions.primaryCategory,
      sql`to_char(${transactions.date}::date, 'YYYY-MM')`,
    );

  return pickTopDiscretionaryCategory(
    rows.map((r) => ({
      category: r.category,
      ym: r.ym,
      monthTotal: Number(r.monthTotal),
    })),
    monthBuckets,
  );
}

/** Weeks per month (52 / 12). Used to convert weekly drift totals into a
 * monthly equivalent for the coaching action sentence. */
const WEEKS_PER_MONTH = 52 / 12;

/**
 * Coaching-action category for behind-savings goals. Drift's top
 * currently-elevated category first; falls back to the 3-month-median
 * picker when drift has nothing flagged.
 *
 * The drift path quotes the spike rate (currentTotal × 4.33) so the
 * sentence ("Trim ${cat} at $X/mo") reflects the user's CURRENT
 * behavior — what they'd actually be cutting from. The median fallback
 * returns its own monthly figure unchanged.
 */
export async function getBehindSavingsCoachingCategory(
  userId: string,
): Promise<TopDiscretionaryCategory | null> {
  const drift = await getDriftAnalysis(userId);
  const top = drift.currentlyElevated[0];
  if (top) {
    return {
      name: top.category,
      monthlyAmount: top.currentTotal * WEEKS_PER_MONTH,
    };
  }
  return getTopDiscretionaryCategory(userId);
}
