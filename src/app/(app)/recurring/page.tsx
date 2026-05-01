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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type RecurringStreamRow,
  getMonthlyRecurringOutflow,
  getRecurringStreams,
} from '@/lib/db/queries/recurring';
import { formatCurrency } from '@/lib/utils';

export default async function RecurringPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [streams, monthlyOutflow] = await Promise.all([
    getRecurringStreams(session.user.id),
    getMonthlyRecurringOutflow(session.user.id),
  ]);

  if (streams.length === 0) {
    return (
      <div className="px-8 py-8 max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight mb-6">
          Recurring
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>No recurring activity detected yet</CardTitle>
            <CardDescription>
              Plaid needs at least 60-90 days of transaction history to
              identify recurring streams. Once enough data has synced,
              subscriptions, payroll, rent, and similar repeat patterns
              will show up here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/settings">Sync your accounts</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const outflows = streams.filter((s) => s.direction === 'outflow');
  const inflows = streams.filter((s) => s.direction === 'inflow');
  const activeOutflows = outflows.filter((s) => s.isActive);
  const monthlyInflow = inflows
    .filter((s) => s.isActive)
    .reduce((sum, s) => {
      if (s.averageAmount == null) return sum;
      // Inflow amounts come in negative from Plaid (money in). Flip to positive.
      return sum + Math.abs(s.averageAmount) * monthlyMultiplier(s.frequency);
    }, 0);

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Recurring</h1>
        <p className="text-sm text-muted-foreground">
          Subscriptions, bills, paychecks, and other repeating transactions
          detected by Plaid.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Monthly outflow"
          value={formatCurrency(monthlyOutflow)}
          subline={`${activeOutflows.length} active ${activeOutflows.length === 1 ? 'subscription' : 'subscriptions'}`}
        />
        <StatCard
          label="Monthly inflow"
          value={formatCurrency(monthlyInflow)}
          subline={
            inflows.filter((s) => s.isActive).length === 0
              ? 'None detected'
              : `${inflows.filter((s) => s.isActive).length} active ${inflows.filter((s) => s.isActive).length === 1 ? 'source' : 'sources'}`
          }
        />
        <StatCard
          label="Net monthly"
          value={formatCurrency(monthlyInflow - monthlyOutflow, {
            signed: true,
          })}
          subline="Recurring inflows minus outflows"
          valueClass={
            monthlyInflow - monthlyOutflow >= 0
              ? 'text-positive'
              : 'text-destructive'
          }
        />
      </div>

      <StreamSection
        title="Subscriptions & bills"
        description="Money leaving your accounts on a regular schedule."
        rows={outflows}
      />
      {inflows.length > 0 && (
        <StreamSection
          title="Income & deposits"
          description="Money arriving on a regular schedule (payroll, refunds, etc.)."
          rows={inflows}
        />
      )}
    </div>
  );
}

function StreamSection({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: RecurringStreamRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Next expected</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <StreamRow key={s.id} s={s} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StreamRow({ s }: { s: RecurringStreamRow }) {
  const display =
    s.averageAmount != null
      ? s.direction === 'inflow'
        ? Math.abs(s.averageAmount)
        : s.averageAmount
      : null;
  return (
    <TableRow className={!s.isActive ? 'opacity-60' : undefined}>
      <TableCell className="max-w-0">
        <p className="font-medium truncate">
          {s.merchantName ?? s.description ?? '—'}
        </p>
        {s.primaryCategory && (
          <p className="text-xs text-muted-foreground">
            {humanizeCategory(s.primaryCategory)}
          </p>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
        {humanizeFrequency(s.frequency)}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
        {s.accountName}
        {s.accountMask && (
          <span className="text-muted-foreground/70"> ····{s.accountMask}</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums text-xs whitespace-nowrap">
        {s.lastDate ? formatTxDate(s.lastDate) : '—'}
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums text-xs whitespace-nowrap">
        {s.predictedNextDate ? formatTxDate(s.predictedNextDate) : '—'}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums font-medium whitespace-nowrap ${
          s.direction === 'inflow' ? 'text-positive' : ''
        }`}
      >
        {display != null
          ? formatCurrency(s.direction === 'inflow' ? display : display, {
              signed: false,
            })
          : '—'}
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap">
        <StatusBadge status={s.status} active={s.isActive} />
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  if (!active) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        Inactive
      </span>
    );
  }
  if (status === 'EARLY_DETECTION') {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        Early
      </span>
    );
  }
  if (status === 'TOMBSTONED') {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        Cancelled
      </span>
    );
  }
  return (
    <span className="rounded-full bg-positive/10 px-2 py-0.5 text-positive">
      Active
    </span>
  );
}

function StatCard({
  label,
  value,
  subline,
  valueClass,
}: {
  label: string;
  value: string;
  subline: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-3xl tabular ${valueClass ?? ''}`}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{subline}</p>
      </CardContent>
    </Card>
  );
}

function formatTxDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
