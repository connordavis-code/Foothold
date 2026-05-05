import Link from 'next/link';
import { ArrowRight, Repeat } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import {
  type RecurringStreamRow,
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

  const outflows = streams.filter((s) => s.direction === 'outflow');
  const inflows = streams.filter((s) => s.direction === 'inflow');
  const activeOutflows = outflows.filter((s) => s.isActive);
  const activeInflows = inflows.filter((s) => s.isActive);
  const monthlyInflow = activeInflows.reduce((sum, s) => {
    if (s.averageAmount == null) return sum;
    return sum + Math.abs(s.averageAmount) * monthlyMultiplier(s.frequency);
  }, 0);

  const net = monthlyInflow - monthlyOutflow;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="space-y-1.5">
        <p className="text-eyebrow">
          Plan
        </p>
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

      <StreamSection
        eyebrow="Subscriptions & bills"
        sub="Money leaving your accounts on a regular schedule."
        rows={outflows}
      />
      {inflows.length > 0 && (
        <StreamSection
          eyebrow="Income & deposits"
          sub="Money arriving on a regular schedule (payroll, refunds, etc.)."
          rows={inflows}
        />
      )}
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
      <p className="text-eyebrow">
        {label}
      </p>
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

function StreamSection({
  eyebrow,
  sub,
  rows,
}: {
  eyebrow: string;
  sub: string;
  rows: RecurringStreamRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <p className="text-eyebrow">
          {eyebrow} · {rows.length}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur">
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
                <th className="px-3 py-2 text-left font-medium">Merchant</th>
                <th className="px-3 py-2 text-left font-medium w-[120px]">
                  Frequency
                </th>
                <th className="px-3 py-2 text-left font-medium w-[180px]">
                  Account
                </th>
                <th className="px-3 py-2 text-left font-medium w-[110px]">
                  Last seen
                </th>
                <th className="px-3 py-2 text-left font-medium w-[110px]">
                  Next
                </th>
                <th className="px-3 py-2 text-right font-medium w-[120px]">
                  Amount
                </th>
                <th className="px-3 py-2 text-left font-medium w-[100px]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <StreamRow key={s.id} s={s} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StreamRow({ s }: { s: RecurringStreamRow }) {
  const display =
    s.averageAmount != null ? Math.abs(s.averageAmount) : null;
  return (
    <tr
      className={cn(
        'border-b border-border/60 transition-colors duration-fast ease-out-quart hover:bg-surface-sunken/60 last:border-b-0',
        !s.isActive && 'opacity-60',
      )}
    >
      <td className="max-w-0 px-3 py-1.5">
        <p className="truncate text-sm font-medium">
          {pickLabel(s.merchantName, s.description, s.primaryCategory)}
        </p>
        {s.primaryCategory && (
          <p className="truncate text-xs text-muted-foreground">
            {humanizeCategory(s.primaryCategory)}
          </p>
        )}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
        {humanizeFrequency(s.frequency)}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
        {s.accountName}
        {s.accountMask && (
          <span className="text-muted-foreground/70"> ····{s.accountMask}</span>
        )}
      </td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {s.lastDate ? formatTxDate(s.lastDate) : '—'}
      </td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {s.predictedNextDate ? formatTxDate(s.predictedNextDate) : '—'}
      </td>
      <td
        className={cn(
          'px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap',
          s.direction === 'inflow' ? 'text-positive' : 'text-foreground',
        )}
      >
        {display != null ? formatCurrency(display) : '—'}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-xs">
        <StatusBadge status={s.status} active={s.isActive} />
      </td>
    </tr>
  );
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  if (!active) {
    return (
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        Inactive
      </span>
    );
  }
  if (status === 'EARLY_DETECTION') {
    return (
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        Early
      </span>
    );
  }
  if (status === 'TOMBSTONED') {
    return (
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        Cancelled
      </span>
    );
  }
  return (
    <span className="rounded-md bg-positive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-positive">
      Active
    </span>
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
            No recurring activity yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Plaid needs 60–90 days of transaction history to identify
            recurring streams. Subscriptions, payroll, and bills will
            surface here once enough data has synced.
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

// Plaid sandbox often returns empty merchantName + description; fall through
// to humanized category so the row never reads as blank.
function pickLabel(
  merchantName: string | null,
  description: string | null,
  primaryCategory: string | null,
): string {
  return (
    merchantName?.trim() ||
    description?.trim() ||
    (primaryCategory ? humanizeCategory(primaryCategory) : '') ||
    'Recurring'
  );
}

function formatTxDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
  });
}

function humanizeCategory(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
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

function monthlyMultiplier(f: string): number {
  switch (f) {
    case 'WEEKLY':
      return 52 / 12;
    case 'BIWEEKLY':
      return 26 / 12;
    case 'SEMI_MONTHLY':
      return 2;
    case 'MONTHLY':
      return 1;
    case 'ANNUALLY':
      return 1 / 12;
    default:
      return 1;
  }
}
