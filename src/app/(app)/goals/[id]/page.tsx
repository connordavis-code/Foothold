// src/app/(app)/goals/[id]/page.tsx
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { GoalCoachingCard } from '@/components/goals/coaching-card';
import { GoalDetailHeader } from '@/components/goals/detail-header';
import { GoalProjectionCard } from '@/components/goals/projection-card';
import { SavingsFeed } from '@/components/goals/savings-feed';
import { SpendCapFeed } from '@/components/goals/spend-cap-feed';
import { GoalTrajectoryChart } from '@/components/goals/trajectory-chart';
import { getCategoryOptions } from '@/lib/db/queries/categories';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import {
  getBehindSavingsCoachingCategory,
  getContributingFeed,
  getGoalDetail,
  getGoalTrajectory,
} from '@/lib/db/queries/goal-detail';
import { humanizeCategory } from '@/lib/format/category';
import { composeCoaching, type CoachingInput } from '@/lib/goals/coaching';
import { paceVerdict } from '@/lib/goals/pace';

type Props = {
  params: { id: string };
};

export default async function GoalDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  // Fetch detail first; if missing, 404 before doing the heavier queries.
  const goal = await getGoalDetail(params.id, userId);
  if (!goal) notFound();

  const [trajectory, feed, topCategory, categoryOptions] = await Promise.all([
    getGoalTrajectory(params.id, userId),
    getContributingFeed(params.id, userId),
    getBehindSavingsCoachingCategory(userId),
    getCategoryOptions(userId),
  ]);

  const verdict = paceVerdict(goal);
  const coaching = composeCoaching(
    buildCoachingInput(goal, verdict, feed, topCategory),
  );

  const target =
    goal.progress.type === 'savings' ? goal.progress.target : goal.progress.cap;
  const isBehind = verdict === 'behind' || verdict === 'over';
  const showChart = (trajectory?.series.length ?? 0) >= 7;
  const projection = trajectory ? computeProjection(goal, trajectory) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <GoalDetailHeader goal={goal} />
      <GoalProjectionCard goal={goal} />
      {showChart && trajectory ? (
        <section className="rounded-card border border-border bg-card p-5 sm:p-6">
          <p className="text-eyebrow mb-3">Trajectory</p>
          <GoalTrajectoryChart
            series={trajectory.series}
            windowStart={trajectory.windowStart}
            windowEnd={trajectory.windowEnd}
            target={target}
            isBehind={isBehind}
            projection={projection}
          />
        </section>
      ) : (
        <section className="rounded-card border border-border bg-card p-5 sm:p-6">
          <p className="text-eyebrow mb-2">Trajectory</p>
          <p className="text-sm text-muted-foreground">
            Enough data to chart trajectory after a week of activity.
          </p>
        </section>
      )}
      {feed.kind === 'spend_cap' && (
        <SpendCapFeed
          rows={feed.rows}
          categoryHref={
            goal.categoryFilter?.length === 1 ? goal.categoryFilter[0] : null
          }
          categoryOptions={categoryOptions}
        />
      )}
      {feed.kind === 'savings' && <SavingsFeed rows={feed.rows} />}
      <GoalCoachingCard coaching={coaching} />
    </div>
  );
}

/**
 * Bridges the DB shape (GoalWithProgress + feed) to the coaching predicate's
 * discriminated union. Keeps composeCoaching pure of database concerns.
 *
 * topDiscretionaryCategory feeds behind-savings' action sentence ("Trim
 * Dining by $213/mo to recover"). Source is /drift's currently-elevated
 * top category first (currentTotal × 4.33 → monthly), with the trailing-
 * 3-month median picker as fallback when drift has nothing flagged.
 */
function buildCoachingInput(
  goal: GoalWithProgress,
  verdict: ReturnType<typeof paceVerdict>,
  feed: Awaited<ReturnType<typeof getContributingFeed>>,
  topCategory: Awaited<ReturnType<typeof getBehindSavingsCoachingCategory>>,
): CoachingInput {
  const p = goal.progress;
  if (p.type === 'savings') {
    if (verdict === 'hit') {
      return {
        kind: 'savings',
        verdict: 'hit',
        hitDate: new Date().toISOString().slice(0, 10),
        overshoot: p.current - p.target,
      };
    }
    // requiredMonthlyVelocity = remaining / months until target. If no target
    // date OR the target is past, fall back to monthly velocity needed to
    // reach target in 12 months from now.
    const required = computeRequiredMonthlyVelocity(goal);
    if (verdict === 'on-pace') {
      return {
        kind: 'savings',
        verdict: 'on-pace',
        monthlyVelocity: p.monthlyVelocity,
        requiredMonthlyVelocity: required,
        topDiscretionaryCategory: null,
      };
    }
    return {
      kind: 'savings',
      verdict: 'behind',
      monthlyVelocity: p.monthlyVelocity,
      requiredMonthlyVelocity: required,
      topDiscretionaryCategory: topCategory
        ? {
            name: humanizeCategory(topCategory.name),
            monthlyAmount: topCategory.monthlyAmount,
          }
        : null,
    };
  }
  // spend_cap
  const topMerchants =
    feed.kind === 'spend_cap'
      ? feed.rows
          .map((r) => ({ name: r.merchantName ?? r.name, amount: r.amount }))
          .slice(0, 3)
      : [];
  if (verdict === 'over') {
    return {
      kind: 'spend_cap',
      verdict: 'over',
      cap: p.cap,
      spent: p.spent,
      projectedMonthly: p.projectedMonthly,
      topMerchants,
    };
  }
  if (verdict === 'behind') {
    return {
      kind: 'spend_cap',
      verdict: 'behind',
      cap: p.cap,
      spent: p.spent,
      projectedMonthly: p.projectedMonthly,
      topMerchants,
    };
  }
  return {
    kind: 'spend_cap',
    verdict: 'on-pace',
    cap: p.cap,
    spent: p.spent,
    projectedMonthly: p.projectedMonthly,
    topMerchants,
  };
}

function computeRequiredMonthlyVelocity(goal: GoalWithProgress): number {
  if (goal.progress.type !== 'savings') return 0;
  const remaining = goal.progress.remaining;
  if (!goal.targetDate) return remaining / 12;
  const target = new Date(goal.targetDate + 'T00:00:00Z');
  const today = new Date();
  const monthsRemaining = Math.max(
    1,
    (target.getTime() - today.getTime()) / (30 * 24 * 60 * 60 * 1000),
  );
  return remaining / monthsRemaining;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30.5;

/**
 * Projected continuation line per spec § 5.3 — extends the chart from
 * "today" to windowEnd at the goal's current pace.
 *
 * Savings: walk forward at monthlyVelocity / DAYS_PER_MONTH per day,
 * floored at 0 so a heavy spender doesn't render a negative trajectory.
 *
 * Spend-cap: projectedMonthly is already the linear day-of-month
 * extrapolation, so endValue is just that.
 *
 * Returns null when the projection isn't meaningful (no remaining days,
 * or the trajectory series is empty).
 */
function computeProjection(
  goal: GoalWithProgress,
  trajectory: { series: { date: string; cumulative: number }[]; windowEnd: string },
): { startDate: string; startValue: number; endDate: string; endValue: number } | null {
  const last = trajectory.series[trajectory.series.length - 1];
  if (!last) return null;
  const start = new Date(last.date + 'T00:00:00Z');
  const end = new Date(trajectory.windowEnd + 'T00:00:00Z');
  const daysRemaining = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (daysRemaining <= 0) return null;

  if (goal.progress.type === 'savings') {
    const dailyRate = goal.progress.monthlyVelocity / DAYS_PER_MONTH;
    const endValue = Math.max(0, last.cumulative + daysRemaining * dailyRate);
    return {
      startDate: last.date,
      startValue: last.cumulative,
      endDate: trajectory.windowEnd,
      endValue,
    };
  }
  return {
    startDate: last.date,
    startValue: last.cumulative,
    endDate: trajectory.windowEnd,
    endValue: goal.progress.projectedMonthly,
  };
}
