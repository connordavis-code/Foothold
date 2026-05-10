'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { TransactionDetailSheet } from '@/components/transactions/transaction-detail-sheet';
import type { CategoryOption } from '@/lib/db/queries/categories';
import type { RecentTransaction } from '@/lib/db/queries/dashboard';
import { humanizeCategory } from '@/lib/format/category';
import { formatCurrency } from '@/lib/utils';

type Props = {
  transactions: RecentTransaction[];
  categoryOptions: CategoryOption[];
};

/**
 * Five most recent transactions as a flat row list (per R.2 prototype).
 * Renamed from <RecentActivityCard> + restyled to drop the section card
 * shell — the rows breathe with the page rhythm now.
 *
 * Tap-to-edit on mobile preserved: row tap at <md opens the same half-
 * sheet /transactions uses. At md+, the row is presentational — desktop's
 * canonical edit flow lives in the operator table.
 */
export function RecentActivity({ transactions, categoryOptions }: Props) {
  const [active, setActive] = useState<RecentTransaction | null>(null);
  if (transactions.length === 0) return null;
  const visible = transactions.slice(0, 5);

  return (
    <section>
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[--text]">Recent activity</h3>
          <p className="text-xs text-[--text-3]">
            Last {visible.length} transactions
          </p>
        </div>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 text-xs text-[--text-2] hover:text-[--text]"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <ul className="mt-3 divide-y divide-[--hairline]">
        {visible.map((t) => (
          <Row key={t.id} t={t} onTap={() => setActive(t)} />
        ))}
      </ul>

      <TransactionDetailSheet
        row={active}
        categoryOptions={categoryOptions}
        onClose={() => setActive(null)}
      />
    </section>
  );
}

function Row({ t, onTap }: { t: RecentTransaction; onTap: () => void }) {
  // Plaid sign convention: positive = money OUT. Flip for display.
  const display = -t.amount;
  const isIncome = display > 0;
  const categoryLabel = t.overrideCategoryName
    ? t.overrideCategoryName
    : t.primaryCategory
      ? humanizeCategory(t.primaryCategory)
      : null;

  const inner = (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5">
      <div className="font-mono text-xs tabular-nums text-[--text-3]">
        {formatTxDate(t.date)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[--text]">
          {t.merchantName ?? t.name}
          {t.pending && (
            <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-[--text-3]">
              pending
            </span>
          )}
        </p>
        <p className="truncate text-xs text-[--text-3]">
          {t.name}
          {categoryLabel && (
            <>
              <span> · </span>
              <span className={t.overrideCategoryName ? 'italic' : undefined}>
                {categoryLabel}
              </span>
            </>
          )}
          {' · '}
          {t.accountName}
          {t.accountMask && ` ····${t.accountMask}`}
        </p>
      </div>
      <p
        className="shrink-0 font-mono text-sm tabular-nums"
        style={{
          color: isIncome ? 'var(--semantic-success)' : 'var(--text)',
        }}
      >
        {formatCurrency(display, { signed: true })}
      </p>
    </div>
  );

  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className="block w-full text-left transition-colors hover:bg-[--surface-2] md:pointer-events-none md:cursor-default md:hover:bg-transparent"
      >
        {inner}
      </button>
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
