import Link from 'next/link';
import { ArrowRight, Repeat } from 'lucide-react';
import { auth } from '@/auth';
import { RecurringOverview } from '@/components/recurring/recurring-overview';
import { Button } from '@/components/ui/button';
import {
  frequencyToMonthlyMultiplier,
  getMonthlyRecurringOutflow,
  getRecurringStreams,
} from '@/lib/db/queries/recurring';
import { cn, formatCurrency } from '@/lib/utils';

export default async function RecurringPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [streams, monthlyOutflow] = await Promise.all([
    getRecurringStreams(session.user.id),
    getMonthlyRecurringOutflow(session.user.id),
  ]);

  if (streams.length === 0) {
    return <EmptyState />;
  }

  const activeOutflows = streams.filter(
    (s) => s.direction === 'outflow' && s.isActive,
  );
  const activeInflows = streams.filter(
    (s) => s.direction === 'inflow' && s.isActive,
  );
  const monthlyInflow = activeInflows.reduce((sum, s) => {
    if (s.averageAmount == null) return sum;
    return (
      sum +
      Math.abs(s.averageAmount) * frequencyToMonthlyMultiplier(s.frequency)
    );
  }, 0);
  const net = monthlyInflow - monthlyOutflow;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="space-y-1.5">
        <p className="text-eyebrow">Plan</p>
        <h1 className="text-xl font-semibold tracking-tight">Recurring</h1>
      </div>

      <section className="grid grid-cols-1 divide-y divide-border rounded-card border border-border bg-surface-elevated md:grid-cols-3 md:divide-x md:divide-y-0">
        <SummaryCell
          label="Monthly outflow"
          value={formatCurrency(monthlyOutflow)}
          sub={`${activeOutflows.length} active ${activeOutflows.length === 1 ? 'subscription' : 'subscriptions'}`}
        />
        <SummaryCell
          label="Monthly inflow"
          value={formatCurrency(monthlyInflow)}
          sub={
            activeInflows.length === 0
              ? 'None detected yet'
              : `${activeInflows.length} active ${activeInflows.length === 1 ? 'source' : 'sources'}`
          }
        />
        <SummaryCell
          label="Net monthly"
          value={formatCurrency(net, { signed: true })}
          sub="Inflows minus outflows"
          valueClass={net >= 0 ? 'text-positive' : 'text-destructive'}
        />
      </section>

      <RecurringOverview streams={streams} />
    </div>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-5 sm:p-6">
      <p className="text-eyebrow">{label}</p>
      <p
        className={cn(
          'font-mono text-2xl font-semibold tracking-[-0.015em] tabular-nums sm:text-3xl',
          valueClass,
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-accent text-foreground/80">
          <Repeat className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Not enough history yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Plaid needs 60–90 days of transaction data to detect
            subscriptions, payroll, and bills. Connecting more accounts
            shortens the wait.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/settings">
              Connect more accounts
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
