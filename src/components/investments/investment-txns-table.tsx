import type { RecentInvestmentTxn } from '@/lib/db/queries/investments';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  transactions: RecentInvestmentTxn[];
};

/**
 * Secondary mono table on /investments. Same operator pattern as the
 * /transactions table — sticky head, py-1.5 rows, JetBrains Mono on
 * date + amount, sans on label columns. No keyboard nav here; this is
 * a viewing surface, not an edit surface, and adding j/k would conflict
 * with the holdings table above.
 */
export function InvestmentTxnsTable({ transactions }: Props) {
  if (transactions.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Recent investment activity · {transactions.length}
      </p>
      <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur">
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
                <th className="px-3 py-2 text-left font-medium w-[110px]">
                  Date
                </th>
                <th className="px-3 py-2 text-left font-medium w-[90px]">
                  Type
                </th>
                <th className="px-3 py-2 text-left font-medium">Security</th>
                <th className="px-3 py-2 text-right font-medium w-[110px]">
                  Qty
                </th>
                <th className="px-3 py-2 text-right font-medium w-[120px]">
                  Amount
                </th>
                <th className="px-3 py-2 text-left font-medium w-[180px]">
                  Account
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <Row key={t.id} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Row({ t }: { t: RecentInvestmentTxn }) {
  // Plaid sign convention on investment txns: positive amount = cash OUT
  // of the account (a buy), negative = cash IN (sell, dividend). Flip
  // for display so a buy reads as a debit and a dividend as a credit.
  const display = -t.amount;
  const isPositive = display > 0;

  return (
    <tr className="border-b border-border/60 transition-colors duration-fast ease-out-quart hover:bg-surface-sunken/60 last:border-b-0">
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {formatDate(t.date)}
      </td>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap">
        <TypePill type={t.type} subtype={t.subtype} />
      </td>
      <td className="max-w-0 px-3 py-1.5">
        <div className="flex items-center gap-2">
          {t.ticker && (
            <span className="font-mono text-xs font-medium">{t.ticker}</span>
          )}
          <span className="truncate text-sm">
            {t.securityName ?? t.name ?? '—'}
          </span>
        </div>
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {t.quantity != null
          ? t.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })
          : '—'}
      </td>
      <td
        className={cn(
          'px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap',
          isPositive ? 'text-positive' : 'text-foreground',
        )}
      >
        {formatCurrency(display, { signed: true })}
      </td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
        {t.accountName}
        {t.accountMask && (
          <span className="text-muted-foreground/70"> ····{t.accountMask}</span>
        )}
      </td>
    </tr>
  );
}

function TypePill({
  type,
  subtype,
}: {
  type: string | null;
  subtype: string | null;
}) {
  const label = type ?? '—';
  const tone = pillTone(type);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        tone,
      )}
      title={subtype ?? undefined}
    >
      {label}
    </span>
  );
}

function pillTone(type: string | null): string {
  switch (type) {
    case 'buy':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
    case 'sell':
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-300';
    case 'cash':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'fee':
    case 'tax':
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-300';
    case 'transfer':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
  });
}
