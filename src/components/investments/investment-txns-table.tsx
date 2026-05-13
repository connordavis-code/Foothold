import { groupTransactionsByDate } from '@/lib/transactions/group-by-date';
import type { RecentInvestmentTxn } from '@/lib/db/queries/investments';
import { humanizeDate } from '@/lib/format/date';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  transactions: RecentInvestmentTxn[];
};

/**
 * Date-grouped recent activity. Eyebrow renamed "Recent activity"
 * (parent section is /investments — "investment" qualifier is
 * redundant). Per DESIGN.md restraint: single muted pill for type,
 * no categorical hue palette.
 */
export function InvestmentTxnsTable({ transactions }: Props) {
  if (transactions.length === 0) return null;

  // Plaid sign convention on investment txns: positive amount = cash
  // OUT (a buy), negative = cash IN (sell, dividend). The grouper's
  // dayNet preserves sign, so flip up front for display: dayNet > 0
  // here will mean "net cash INTO portfolio" once flipped.
  const flippedForDisplay = transactions.map((t) => ({
    ...t,
    amount: -t.amount,
  }));
  const groups = groupTransactionsByDate(flippedForDisplay);

  return (
    <section className="hidden space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:block md:p-8">
      <header>
        <p className="text-eyebrow">
          Recent activity · {transactions.length}
        </p>
      </header>

      <ul className="divide-y divide-[--hairline]">
        {groups.map((group) => {
          const dayNetUp = group.dayNet >= 0;
          return (
            <li key={group.dateIso}>
              <div className="flex items-baseline justify-between gap-3 py-2.5 text-xs text-[--text-3]">
                <span className="font-mono uppercase tracking-[0.08em]">
                  {humanizeDate(group.dateIso)}
                </span>
                <span
                  className={cn(
                    'font-mono tabular-nums',
                    dayNetUp ? 'text-positive' : 'text-destructive',
                  )}
                >
                  {dayNetUp ? '↑' : '↓'}{' '}
                  {formatCurrency(Math.abs(group.dayNet))}
                </span>
              </div>
              <ul className="space-y-1.5 pb-3">
                {group.rows.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Row({ t }: { t: RecentInvestmentTxn }) {
  // Caller pre-flipped amount; positive = credit (sell/dividend).
  const isPositive = t.amount > 0;

  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <TypePill type={t.type} subtype={t.subtype} />
          {t.ticker && (
            <span className="font-mono text-xs font-medium text-[--text]">
              {t.ticker}
            </span>
          )}
          <span className="truncate text-[--text-2]">
            {t.securityName ?? t.name ?? '—'}
          </span>
        </div>
        <p className="text-xs text-[--text-3]">
          {t.accountName}
          {t.accountMask && <span> ····{t.accountMask}</span>}
          {t.quantity != null && (
            <span className="ml-2 font-mono tabular-nums">
              {t.quantity.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}{' '}
              sh
            </span>
          )}
        </p>
      </div>
      <div
        className={cn(
          'shrink-0 font-mono tabular-nums',
          isPositive ? 'text-positive' : 'text-[--text]',
        )}
      >
        {formatCurrency(t.amount, { signed: true })}
      </div>
    </li>
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
  return (
    <span
      className="inline-flex items-center rounded-md bg-[--hairline] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[--text-2]"
      title={subtype ?? undefined}
    >
      {label}
    </span>
  );
}
