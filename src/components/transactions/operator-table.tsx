'use client';

import { useEffect, useRef } from 'react';
import type { TransactionListRow } from '@/lib/db/queries/transactions';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  rows: TransactionListRow[];
  selectedIndex: number;
};

/**
 * Operator-tier transactions table. JetBrains Mono on date + amount,
 * py-1.5 rows, sticky thead. The selected row (driven by j/k keys
 * upstream) gets an accent ring + scrolls into view. Hover and selected
 * states share the surface-sunken background — selected is just hover
 * locked in place.
 */
export function OperatorTable({ rows, selectedIndex }: Props) {
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, rows.length);
  }, [rows.length]);

  useEffect(() => {
    const el = rowRefs.current[selectedIndex];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [selectedIndex]);

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface-elevated px-6 py-16 text-center text-sm text-muted-foreground">
        No transactions match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
      <div className="max-h-[calc(100vh-15rem)] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur">
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
              <Th className="w-[110px] text-left">Date</Th>
              <Th className="text-left">Description</Th>
              <Th className="text-left">Category</Th>
              <Th className="text-left">Account</Th>
              <Th className="w-[120px] text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <Row
                key={t.id}
                t={t}
                isSelected={i === selectedIndex}
                rowRef={(el) => {
                  rowRefs.current[i] = el;
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn('px-3 py-2 font-medium', className)}
      scope="col"
    >
      {children}
    </th>
  );
}

function Row({
  t,
  isSelected,
  rowRef,
}: {
  t: TransactionListRow;
  isSelected: boolean;
  rowRef: (el: HTMLTableRowElement | null) => void;
}) {
  // Plaid sign convention: positive = money OUT. Flip for display.
  const display = -t.amount;
  const isIncome = display > 0;

  return (
    <tr
      ref={rowRef}
      aria-selected={isSelected}
      className={cn(
        'border-b border-border/60 transition-colors duration-fast ease-out-quart last:border-b-0',
        isSelected ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60',
      )}
    >
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {formatTxDate(t.date)}
      </td>
      <td className="max-w-0 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {t.merchantName ?? t.name}
          </span>
          {t.pending && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              pending
            </span>
          )}
        </div>
        {t.merchantName && t.merchantName !== t.name && (
          <p className="truncate text-xs text-muted-foreground">{t.name}</p>
        )}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
        {t.primaryCategory ? humanize(t.primaryCategory) : '—'}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
        {t.accountName}
        {t.accountMask && (
          <span className="text-muted-foreground/70"> ····{t.accountMask}</span>
        )}
      </td>
      <td
        className={cn(
          'px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap',
          isIncome ? 'text-positive' : 'text-foreground',
        )}
      >
        {formatCurrency(display, { signed: true })}
      </td>
    </tr>
  );
}

function formatTxDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  // Compact mono format: "May 03". Year is implicit unless filtering
  // back further; the filter row already shows "From" if needed.
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
  });
}

function humanize(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
