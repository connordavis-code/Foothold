import Link from 'next/link';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { GoalsStrip } from '@/components/goals/goals-strip';
import { ReauthBanner } from '@/components/plaid/reauth-banner';
import {
  getDashboardSummary,
  getRecentTransactions,
} from '@/lib/db/queries/dashboard';
import { getGoalsWithProgress } from '@/lib/db/queries/goals';
import { getItemsNeedingReauth } from '@/lib/db/queries/plaid';
import {
  getMonthlyRecurringOutflow,
  getRecurringStreams,
} from '@/lib/db/queries/recurring';
import { formatCurrency } from '@/lib/utils';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [summary, recent, recurring, monthlyRecurring, goals, reauthItems] =
    await Promise.all([
      getDashboardSummary(session.user.id),
      getRecentTransactions(session.user.id, 10),
      getRecurringStreams(session.user.id),
      getMonthlyRecurringOutflow(session.user.id),
      getGoalsWithProgress(session.user.id),
      getItemsNeedingReauth(session.user.id),
    ]);

  const activeOutflows = recurring.filter(
    (r) => r.direction === 'outflow' && r.isActive,
  );
  const topSubs = activeOutflows.slice(0, 5);

  if (!summary.hasAnyItem) {
    return <EmptyState />;
  }

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Dashboard
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome{session.user.name ? `, ${session.user.name}` : ''}
        </h1>
      </div>

      <ReauthBanner items={reauthItems} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Net worth"
          value={formatCurrency(summary.netWorth)}
          subline={`${formatCurrency(summary.assets)} assets · ${formatCurrency(summary.liabilities)} liabilities`}
        />
        <StatCard
          label="This month spend"
          value={formatCurrency(summary.monthSpend)}
          subline={
            summary.monthSpend === 0
              ? 'No transactions this month'
              : 'Excludes transfers and loan payments'
          }
        />
        <StatCard
          label="Investments"
          value={formatCurrency(summary.investments)}
          subline={
            summary.investments === 0
              ? 'No investment accounts'
              : 'Account-level balances'
          }
        />
        <StatCard
          label="Recurring / month"
          value={formatCurrency(monthlyRecurring)}
          subline={
            activeOutflows.length === 0
              ? 'No subscriptions detected yet'
              : `${activeOutflows.length} active ${activeOutflows.length === 1 ? 'subscription' : 'subscriptions'}`
          }
        />
      </div>

      <GoalsStrip goals={goals} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>
              Last {recent.length}{' '}
              {recent.length === 1 ? 'transaction' : 'transactions'} across
              all your accounts.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/transactions">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transactions synced yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {topSubs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle>Top subscriptions</CardTitle>
              <CardDescription>
                Active recurring outflows detected from your transaction
                history.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/recurring">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {topSubs.map((s) => (
                <SubscriptionRow key={s.id} s={s} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SubscriptionRow({
  s,
}: {
  s: Awaited<ReturnType<typeof getRecurringStreams>>[number];
}) {
  return (
    <li className="flex items-center justify-between py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {s.merchantName ?? s.description ?? 'Unknown'}
          {s.status === 'EARLY_DETECTION' && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              early detection
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {humanizeFrequency(s.frequency)}
          {s.predictedNextDate &&
            ` · next ${formatTxDate(s.predictedNextDate)}`}
          {' · '}
          {s.accountName}
          {s.accountMask && ` ····${s.accountMask}`}
        </p>
      </div>
      <p className="tabular text-sm font-medium tabular-nums shrink-0 ml-4">
        {s.averageAmount != null ? formatCurrency(s.averageAmount) : '—'}
      </p>
    </li>
  );
}

function humanizeFrequency(f: string): string {
  switch (f) {
    case 'WEEKLY':
      return 'Weekly';
    case 'BIWEEKLY':
      return 'Every 2 weeks';
    case 'SEMI_MONTHLY':
      return 'Twice a month';
    case 'MONTHLY':
      return 'Monthly';
    case 'ANNUALLY':
      return 'Annually';
    default:
      return 'Recurring';
  }
}

function StatCard({
  label,
  value,
  subline,
}: {
  label: string;
  value: string;
  subline: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{subline}</p>
      </CardContent>
    </Card>
  );
}

function TransactionRow({
  t,
}: {
  t: Awaited<ReturnType<typeof getRecentTransactions>>[number];
}) {
  // Plaid: positive amount = money out (debit). Flip the sign for display.
  const display = -t.amount;
  const isIncome = display > 0;

  return (
    <li className="flex items-center justify-between py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {t.merchantName ?? t.name}
          {t.pending && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              pending
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {formatTxDate(t.date)}
          {t.primaryCategory && ` · ${humanizeCategory(t.primaryCategory)}`}
          {' · '}
          {t.accountName}
          {t.accountMask && ` ····${t.accountMask}`}
        </p>
      </div>
      <p
        className={`tabular text-sm font-medium tabular-nums shrink-0 ml-4 ${
          isIncome ? 'text-positive' : 'text-foreground'
        }`}
      >
        {formatCurrency(display, { signed: true })}
      </p>
    </li>
  );
}

function formatTxDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Plaid PFC primary categories come back like 'FOOD_AND_DRINK'. Make readable. */
function humanizeCategory(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

function EmptyState() {
  return (
    <div className="px-8 py-8 max-w-7xl mx-auto">
      <div className="space-y-1 mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Dashboard
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Connect your first account</CardTitle>
          <CardDescription>
            Connect a bank or brokerage via Plaid to see your net worth,
            transactions, and investments here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/settings">Go to Settings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
