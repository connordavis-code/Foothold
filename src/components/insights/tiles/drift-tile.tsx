import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { InsightSupplements } from '@/lib/insights/types';

type Props = {
  data: InsightSupplements['drift'];
};

function humanizeCategory(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function DriftTile({ data }: Props) {
  const top = data.elevated.slice(0, 3);
  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Drift
      </p>
      <p className="mt-2 text-sm text-foreground">
        {data.elevated.length} {data.elevated.length === 1 ? 'category' : 'categories'} elevated
      </p>
      <ul className="mt-3 space-y-1.5 text-xs">
        {top.map((f) => (
          <li
            key={f.category}
            className="flex items-center justify-between gap-3 text-foreground/80"
          >
            <span className="truncate">{humanizeCategory(f.category)}</span>
            <span className="font-mono tabular-nums text-foreground">
              {f.ratio.toFixed(1)}× · {formatCurrency(f.currentTotal)}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/drift"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
      >
        See drift detail
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
