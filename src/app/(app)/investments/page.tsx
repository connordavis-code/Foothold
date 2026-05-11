import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { auth } from '@/auth';
import { AllocationSection } from '@/components/investments/allocation-section';
import { HoldingsView } from '@/components/investments/holdings-view';
import { InvestmentsPageHeader } from '@/components/investments/investments-page-header';
import { InvestmentTxnsTable } from '@/components/investments/investment-txns-table';
import { MobileInvestments } from '@/components/investments/mobile-investments';
import { PerformanceChart } from '@/components/investments/performance-chart';
import { PortfolioHero } from '@/components/investments/portfolio-hero';
import { Button } from '@/components/ui/button';
import {
  getHoldingsFlat,
  getPortfolioSummary,
  getRecentInvestmentTransactions,
} from '@/lib/db/queries/investments';
import { getPortfolioHistory } from '@/lib/db/queries/portfolio-history';
import { getSourceHealth } from '@/lib/db/queries/health';
import { formatFreshness } from '@/lib/format/freshness';
import { buildAllocation } from '@/lib/investments/allocation';

export default async function InvestmentsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [summary, holdings, txns, history, sourceHealth] = await Promise.all([
    getPortfolioSummary(session.user.id),
    getHoldingsFlat(session.user.id),
    getRecentInvestmentTransactions(session.user.id, 20),
    getPortfolioHistory(session.user.id),
    getSourceHealth(session.user.id),
  ]);

  if (summary.accountCount === 0) {
    return <EmptyState />;
  }

  // Capability-aware freshness: a brokerage failing its investments
  // capability shows stale HERE even if /transactions reads it as fresh,
  // and credit-only Plaid items (which don't track investments at all)
  // are filtered out so they can't be mistaken for "never-synced".
  const investmentSources = sourceHealth
    .filter((s) => s.capabilities.includes('investments'))
    .map((s) => ({
      name: s.institutionName ?? 'Brokerage',
      lastSyncAt: s.lastInvestmentSyncAt,
    }));
  const freshness = formatFreshness({
    sources: investmentSources,
    now: new Date(),
  });

  const allocation = buildAllocation(
    holdings.map((h) => ({
      securityType: h.securityType,
      institutionValue: h.institutionValue,
    })),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <InvestmentsPageHeader
        freshnessHeadline={freshness.headline}
        freshnessCaveat={freshness.caveat}
      />
      <PortfolioHero summary={summary} />
      <PerformanceChart history={history} />
      <AllocationSection allocation={allocation} />
      <HoldingsView holdings={holdings} />
      <InvestmentTxnsTable transactions={txns} />
      <MobileInvestments transactions={txns} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/12 text-accent">
          <TrendingUp className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[--text]">
            No brokerage connected yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-[--text-2]">
            Link a brokerage, IRA, 401(k), or HSA via Plaid or SnapTrade to see
            holdings, day moves, and recent activity here.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/settings">
              Connect a brokerage
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
