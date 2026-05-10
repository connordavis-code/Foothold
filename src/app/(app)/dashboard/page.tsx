import Link from 'next/link';
import { ArrowRight, Mountain } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { DriftModule } from '@/components/dashboard/drift-module';
import { GoalsRow } from '@/components/dashboard/goals-row';
import { Kpis } from '@/components/dashboard/kpis';
import { NetWorthHero } from '@/components/dashboard/net-worth-hero';
import { PageHeader } from '@/components/dashboard/page-header';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { RecurringList } from '@/components/dashboard/recurring-list';
import { WeekInsightCard } from '@/components/dashboard/week-insight-card';
import { MotionStack } from '@/components/motion/motion-stack';
import { TrustStrip } from '@/components/sync/trust-strip';
import { summarizeTrustStrip } from '@/lib/sync/trust-strip';
import { formatRelative } from '@/lib/format/date';
import {
  forecastDailySeries,
  uncertaintyBand,
} from '@/lib/forecast/trajectory';
import { computeRunway, type MonthlyTotals } from '@/lib/forecast/runway';
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
import { getSourceHealth } from '@/lib/db/queries/health';
import {
  getInsightForWeek,
  getInsightSequenceNumber,
  getLatestInsight,
  getWeeklyBriefStats,
} from '@/lib/db/queries/insights';
import { getUpcomingRecurringOutflows } from '@/lib/db/queries/recurring';
import { db } from '@/lib/db';
import { financialAccounts, externalItems } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { projectCash } from '@/lib/forecast/engine';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  // Brief data source: when ?week=YYYY-MM-DD honored, show that specific
  // week; otherwise default to latest. The /insights/[week] deep-link
  // (deleted in R.2) redirects here with the param preserved.
  const requestedWeek = searchParams?.week;
  const insightPromise = requestedWeek
    ? getInsightForWeek(userId, requestedWeek)
    : getLatestInsight(userId);

  const [
    summary,
    monthlyDelta,
    sparkline,
    upcomingRecurring,
    goals,
    drift,
    insight,
    recent,
    liquidAccounts,
    forecastHistory,
    categoryOptions,
    sourceHealth,
  ] = await Promise.all([
    getDashboardSummary(userId),
    getNetWorthMonthlyDelta(userId),
    getNetWorthSparkline(userId, 90),
    getUpcomingRecurringOutflows(userId, 7),
    getGoalsWithProgress(userId),
    getDriftAnalysis(userId),
    insightPromise,
    getRecentTransactions(userId, 5),
    countLiquidAccounts(userId),
    getForecastHistory(userId),
    getCategoryOptions(userId),
    getSourceHealth(userId),
  ]);

  // Brief stats + sequence number depend on the resolved insight's week range.
  const [briefStats, briefSeqNum] = insight
    ? await Promise.all([
        getWeeklyBriefStats(userId, insight.weekStart, insight.weekEnd),
        getInsightSequenceNumber(userId, insight.weekStart),
      ])
    : [null, 0];

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

  // Trajectory inputs: historical sparkline (90 points) + interpolated forecast
  // from projectCash monthly anchors. Band returns null when historical <60 points.
  const historicalSeries = sparkline.map((p) => p.netWorth);
  const forecastSeries = forecastDailySeries(
    liquidBalance,
    projection.projection,
    90,
  );
  const band = uncertaintyBand(historicalSeries, forecastSeries);

  // Runway input: aggregate per-month outflow across all PFC categories;
  // pair with same-index incomeHistory entry. ForecastHistory trims to
  // TRAILING_MONTHS=3 already.
  const incomeHistory = forecastHistory.incomeHistory ?? [];
  const categoryHistory = forecastHistory.categoryHistory ?? {};
  const trailingMonths: MonthlyTotals[] = incomeHistory.map((inflow, i) => {
    const outflow = Object.values(categoryHistory).reduce(
      (sum, arr) => sum + (arr[i] ?? 0),
      0,
    );
    return { inflow, outflow };
  });
  const runwayWeeks = computeRunway(liquidBalance, trailingMonths);

  // T1 inline freshness approximation — T7 swaps this for formatFreshness().
  const todayLabel = `Today · ${new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}`;
  const trustSummary = summarizeTrustStrip(sourceHealth);
  const freshnessHeadline =
    trustSummary.kind === 'healthy'
      ? `Fresh ${formatRelative(trustSummary.freshAt)} · ${trustSummary.sourceCount} ${
          trustSummary.sourceCount === 1 ? 'source' : 'sources'
        }`
      : trustSummary.kind === 'no_signal'
        ? `Sync pending · ${trustSummary.sourceCount} sources`
        : trustSummary.kind === 'quiet'
          ? `Synced ${formatRelative(trustSummary.syncedAt)} · ${trustSummary.sourceCount} sources`
          : `${trustSummary.elevated.length} source${trustSummary.elevated.length === 1 ? '' : 's'} need attention`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        todayLabel={todayLabel}
        freshnessHeadline={freshnessHeadline}
        freshnessCaveat={null}
      />
      <MotionStack className="mt-6 space-y-5">
        <TrustStrip sources={sourceHealth} />

        <NetWorthHero
          netWorth={summary.netWorth}
          monthlyDelta={monthlyDelta}
          historicalSeries={historicalSeries}
          forecastSeries={forecastSeries}
          band={band}
          freshnessHeadline={freshnessHeadline}
        />

        <Kpis
          liquidBalance={liquidBalance}
          liquidAccountCount={liquidAccounts}
          eomProjected={eomProjected}
          runwayWeeks={runwayWeeks}
        />

        <DriftModule elevated={drift.currentlyElevated} />

        <GoalsRow goals={goals} />

        <RecurringList upcoming={upcomingRecurring} />

        <WeekInsightCard
          insight={insight}
          sequenceNumber={briefSeqNum}
          stats={briefStats}
        />

        <RecentActivity
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
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, userId),
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
