import { humanizeCategory } from '@/lib/format/category';
import { formatCurrency } from '@/lib/utils';
import type { InsightSupplements } from '@/lib/insights/types';

type Props = {
  data: InsightSupplements['spending'];
};

export function SpendingTile({ data }: Props) {
  const { totalThisWeek, deltaVsBaseline, topCategories } = data;
  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <p className="text-eyebrow">
        Spending
      </p>
      <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
        {formatCurrency(totalThisWeek)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {deltaVsBaseline === null
          ? 'No baseline yet'
          : deltaVsBaseline > 0
          ? `↑ ${formatCurrency(deltaVsBaseline)} vs 4-wk median`
          : deltaVsBaseline < 0
          ? `↓ ${formatCurrency(Math.abs(deltaVsBaseline))} vs 4-wk median`
          : 'In line with 4-wk median'}
      </p>
      {topCategories.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-xs">
          {topCategories.map((c) => (
            <li
              key={c.category}
              className="flex items-center justify-between gap-3 text-foreground/80"
            >
              <span className="truncate">{humanizeCategory(c.category)}</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatCurrency(c.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
