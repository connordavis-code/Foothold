'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { TransactionDetailSheet } from '@/components/transactions/transaction-detail-sheet';
import type { CategoryOption } from '@/lib/db/queries/categories';
import type { RecentTransaction } from '@/lib/db/queries/dashboard';
import { humanizeCategory } from '@/lib/format/category';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  transactions: RecentTransaction[];
  categoryOptions: CategoryOption[];
};

/**
 * Five most recent transactions as compact card-rows (NOT a table — the
 * full table lives at /transactions). The "View all" link is the right
 * affordance for "I want to scan a hundred rows"; this surface is for
 * "what did I just spend on?".
 *
 * Tap-to-edit on mobile: row tap at <md opens the same half-sheet
 * /transactions uses. At md+, the row is presentational — desktop's
 * canonical edit flow lives in the operator table (j/k nav, multi-
 * select, bulk-action bar), and adding a tap-sheet would conflict with
 * those gestures.
 */
export function RecentActivityCard({ transactions, categoryOptions }: Props) {
  const [active, setActive] = useState<RecentTransaction | null>(null);
  if (transactions.length === 0) return null;
  const visible = transactions.slice(0, 5);

  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-eyebrow">
            Recent activity
          </p>
          <h2 className="mt-1 text-sm font-medium">
            Last {visible.length} transactions
          </h2>
        </div>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <ul className="divide-y divide-border/70">
        {visible.map((t) => (
          <Row
            key={t.id}
            t={t}
            onTap={() => setActive(t)}
          />
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

function Row({
  t,
  onTap,
}: {
  t: RecentTransaction;
  onTap: () => void;
}) {
  // Plaid sign convention: positive = money OUT. Flip for display.
  const display = -t.amount;
  const isIncome = display > 0;
  const categoryLabel = t.overrideCategoryName
    ? t.overrideCategoryName
    : t.primaryCategory
      ? humanizeCategory(t.primaryCategory)
      : null;

  const inner = (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {t.merchantName ?? t.name}
          {t.pending && (
            <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
              pending
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatTxDate(t.date)}
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
        className={cn(
          'shrink-0 font-mono text-sm tabular-nums',
          isIncome ? 'text-positive' : 'text-foreground',
        )}
      >
        {formatCurrency(display, { signed: true })}
      </p>
    </div>
  );

  // Mobile: tap-to-edit. Desktop: presentational (operator table at
  // /transactions is the canonical edit surface).
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className="block w-full text-left transition-colors duration-fast ease-out-quart md:pointer-events-none md:cursor-default md:hover:bg-transparent"
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
