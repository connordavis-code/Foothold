import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { auth } from '@/auth';
import { HoldingsTable } from '@/components/investments/holdings-table';
import { InvestmentTxnsTable } from '@/components/investments/investment-txns-table';
import { PortfolioSummary } from '@/components/investments/portfolio-summary';
import { Button } from '@/components/ui/button';
import {
  getHoldingsFlat,
  getPortfolioSummary,
  getRecentInvestmentTransactions,
} from '@/lib/db/queries/investments';

export default async function InvestmentsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [summary, holdings, txns] = await Promise.all([
    getPortfolioSummary(session.user.id),
    getHoldingsFlat(session.user.id),
    getRecentInvestmentTransactions(session.user.id, 20),
  ]);

  if (summary.accountCount === 0) {
    return <EmptyState />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="space-y-1.5">
        <p className="text-eyebrow">
          Records
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Investments</h1>
      </div>

      <PortfolioSummary summary={summary} />

      <HoldingsTable holdings={holdings} />

      <InvestmentTxnsTable transactions={txns} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-accent text-foreground/80">
          <TrendingUp className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            No brokerage connected yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Link a brokerage, IRA, 401(k), or HSA via Plaid to see
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
