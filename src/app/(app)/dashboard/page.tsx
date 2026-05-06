import Link from 'next/link';
import { ArrowRight, Mountain } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { DriftFlagsCard } from '@/components/dashboard/drift-flags-card';
import { GoalsRow } from '@/components/dashboard/goals-row';
import { HeroCard } from '@/components/dashboard/hero-card';
import { InsightTeaserCard } from '@/components/dashboard/insight-teaser-card';
import { RecentActivityCard } from '@/components/dashboard/recent-activity-card';
import { SplitCard } from '@/components/dashboard/split-card';
import { UpcomingRecurringCard } from '@/components/dashboard/upcoming-recurring-card';
import { MotionStack } from '@/components/motion/motion-stack';
import { getCategoryOptions } from '@/lib/db/queries/categories';
import {
  getDashboardSummary,
  getNetWorthMonthlyDelta,
  getNetWorthSparkline,
  getRecentTransactions,
} from '@/lib/db/queries/dashboard';
import { getDriftAnalysis } from '@/lib/db/queries/drift';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { getGoalsWithProgress } from '@/lib/db/queries/goals';
import { getLatestInsight } from '@/lib/db/queries/insights';
import { getUpcomingRecurringOutflows } from '@/lib/db/queries/recurring';
import { db } from '@/lib/db';
import { financialAccounts, plaidItems } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { projectCash } from '@/lib/forecast/engine';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const [
    summary,
    monthlyDelta,
    sparkline,
    upcomingRecurring,
    goals,
    drift,
    latestInsight,
    recent,
    liquidAccounts,
    forecastHistory,
    categoryOptions,
  ] = await Promise.all([
    getDashboardSummary(userId),
    getNetWorthMonthlyDelta(userId),
    getNetWorthSparkline(userId, 30),
    getUpcomingRecurringOutflows(userId, 7),
    getGoalsWithProgress(userId),
    getDriftAnalysis(userId),
    getLatestInsight(userId),
    getRecentTransactions(userId, 5),
    countLiquidAccounts(userId),
    getForecastHistory(userId),
    getCategoryOptions(userId),
  ]);

  if (!summary.hasAnyItem) {
    return <EmptyState />;
  }

  const liquidBalance = summary.assets - summary.investments;

  // EOM projected: feed the engine the current month with no overrides.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const projection = projectCash({
    history: forecastHistory,
    overrides: {},
    currentMonth,
  });
  const eomProjected = projection.projection[0]?.endCash ?? liquidBalance;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <MotionStack className="space-y-5">
        <HeroCard
          netWorth={summary.netWorth}
          monthlyDelta={monthlyDelta}
          sparkline={sparkline}
        />

        <SplitCard
          liquidBalance={liquidBalance}
          liquidAccountCount={liquidAccounts}
          eomProjected={eomProjected}
        />

        <DriftFlagsCard flags={drift.currentlyElevated} />

        <GoalsRow goals={goals} />

        <UpcomingRecurringCard upcoming={upcomingRecurring} />

        <InsightTeaserCard insight={latestInsight} />

        <RecentActivityCard
          transactions={recent}
          categoryOptions={categoryOptions}
        />
      </MotionStack>
    </div>
  );
}

/**
 * Count of accounts that count as "liquid" — depository only. Used by
 * the SplitCard's "across N accounts" subline. Pulled inline rather
 * than added to getDashboardSummary because no other surface needs the
 * count yet (avoids the slippery-slope of one-off summary fields).
 */
async function countLiquidAccounts(userId: string): Promise<number> {
  const rows = await db
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(plaidItems.userId, userId),
        eq(financialAccounts.type, 'depository'),
      ),
    );
  return rows.length;
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-gradient-hero text-white shadow-sm">
          <Mountain className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to Foothold
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Connect a bank or brokerage to see your net worth, recurring
            charges, and weekly insights all in one place.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild size="default">
            <Link href="/settings">
              Connect your first account
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
