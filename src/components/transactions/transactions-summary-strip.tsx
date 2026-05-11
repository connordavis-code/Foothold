import { formatCurrency, formatCurrencyCompact } from '@/lib/utils';

type Props = {
  /** Month-to-date sum of outflows (positive number). */
  spend: number;
  /** Month-to-date sum of inflows (positive number). */
  income: number;
  /** income − spend; signed. */
  net: number;
  /** Row count in the current filtered view. */
  showing: number;
  /** Active filter count from countActiveFilters(); 0 == unfiltered. */
  activeFilters: number;
};

/**
 * 4-cell KPI strip per SPEC § Locked decision #2:
 *   Spend / Income / Net / Showing
 *
 * Cell typography mirrors <RecurringSummaryStrip>: 10px eyebrow, 20px
 * mono numeral, 12px sub-line. Mono + tabular-nums for digit alignment
 * across cells.
 *
 * Net cell sign-codes via valueClass — positive (income > spend) reads
 * as the brand accent (text-positive); negative reads as text-destructive
 * so an over-spending month surfaces without alarming chrome.
 *
 * "Showing" sub-line follows the auto-locked decision (SPEC § Auto-locked):
 *   - "12 filters applied" when activeFilters > 0
 *   - "unfiltered" when activeFilters === 0
 * No total-count denominator (avoids a second COUNT query; for high-row
 * users the denominator was more noise than signal).
 */
export function TransactionsSummaryStrip({
  spend,
  income,
  net,
  showing,
  activeFilters,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-card bg-[--surface] p-5 sm:grid-cols-4">
      <Stat
        label="Spend · this month"
        value={formatCurrencyCompact(spend)}
        sub={`across ${showing.toLocaleString()} ${showing === 1 ? 'row' : 'rows'}`}
      />
      <Stat
        label="Income · this month"
        value={formatCurrencyCompact(income)}
        sub="month to date"
      />
      <Stat
        label="Net · this month"
        value={formatCurrency(net, { signed: true })}
        sub={
          net >= 0 ? 'earning more than spending' : 'spending more than earning'
        }
        valueClass={net >= 0 ? 'text-positive' : 'text-destructive'}
      />
      <Stat
        label="Showing"
        value={showing.toLocaleString()}
        sub={
          activeFilters > 0
            ? `${activeFilters} ${activeFilters === 1 ? 'filter' : 'filters'} applied`
            : 'unfiltered'
        }
      />
    </div>
  );
}

function Stat({
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
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xl font-semibold tabular-nums text-[--text] ${valueClass ?? ''}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[--text-3]">{sub}</div>
    </div>
  );
}
