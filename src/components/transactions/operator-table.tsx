'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchX } from 'lucide-react';
import type { TransactionListRow } from '@/lib/db/queries/transactions';
import { humanizeCategory } from '@/lib/format/category';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  rows: TransactionListRow[];
  selectedIndex: number;
  selectedIds: Set<string>;
  onToggle: (
    id: string,
    index: number,
    opts: { range?: boolean },
  ) => void;
  onToggleAllVisible: () => void;
  /**
   * Open the detail sheet for a single row. Wired by the shell to
   * `setActive(row)`. The Description cell is the click target — the
   * decorative hover state on the whole row used to imply an
   * affordance that didn't exist; making one specific cell clickable
   * with cursor-pointer + hover-underline makes the hover honest.
   */
  onOpenDetail: (row: TransactionListRow) => void;
};

/**
 * Operator-tier transactions table. Adds multi-select via a checkbox
 * column — click to toggle one row, shift-click to extend a range
 * from the last clicked row. Selection state lives in the shell so
 * the BulkActionBar can read it; the table is presentational.
 *
 * Display layer prefers `overrideCategoryName` over the raw Plaid PFC
 * when set, with a small italic styling as the visual cue.
 */
export function OperatorTable({
  rows,
  selectedIndex,
  selectedIds,
  onToggle,
  onToggleAllVisible,
  onOpenDetail,
}: Props) {
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const allChecked =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someChecked = !allChecked && rows.some((r) => selectedIds.has(r.id));

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, rows.length);
  }, [rows.length]);

  useEffect(() => {
    const el = rowRefs.current[selectedIndex];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [selectedIndex]);

  if (rows.length === 0) {
    return <NoMatchEmpty />;
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
      <div className="max-h-[calc(100vh-15rem)] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur">
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
              <Th className="w-[36px] text-center">
                <SelectAllCheckbox
                  allChecked={allChecked}
                  someChecked={someChecked}
                  disabled={rows.length === 0}
                  onToggle={onToggleAllVisible}
                />
              </Th>
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
                index={i}
                isSelected={i === selectedIndex}
                isChecked={selectedIds.has(t.id)}
                onToggle={onToggle}
                onOpenDetail={onOpenDetail}
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
  ...rest
}: {
  children?: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <th
      className={cn('px-3 py-2 font-medium', className)}
      scope="col"
      {...rest}
    >
      {children}
    </th>
  );
}

function SelectAllCheckbox({
  allChecked,
  someChecked,
  disabled,
  onToggle,
}: {
  allChecked: boolean;
  someChecked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  // `indeterminate` is a DOM property only — React won't set it from props.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someChecked;
  }, [someChecked]);

  const state = allChecked
    ? 'checked'
    : someChecked
      ? 'indeterminate'
      : 'unchecked';
  const label = allChecked
    ? 'Deselect all visible rows'
    : 'Select all visible rows';

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allChecked}
      disabled={disabled}
      data-state={state}
      aria-label={label}
      onChange={onToggle}
      className="h-3.5 w-3.5 cursor-pointer rounded border-border text-foreground accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function NoMatchEmpty() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hasFilters = params.size > 0;

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-border bg-surface-elevated px-6 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-pill bg-accent text-foreground/70">
        <SearchX className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-base font-medium">No transactions match</p>
        <p className="text-sm text-muted-foreground">
          {hasFilters
            ? 'Try widening the date range, switching the account, or clearing the search.'
            : 'No transactions have synced yet — try Sync now from the top bar.'}
        </p>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-xs font-medium text-foreground/80 underline-offset-4 hover:underline"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

function Row({
  t,
  index,
  isSelected,
  isChecked,
  onToggle,
  onOpenDetail,
  rowRef,
}: {
  t: TransactionListRow;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  onToggle: (
    id: string,
    index: number,
    opts: { range?: boolean },
  ) => void;
  onOpenDetail: (row: TransactionListRow) => void;
  rowRef: (el: HTMLTableRowElement | null) => void;
}) {
  // Plaid sign convention: positive = money OUT. Flip for display.
  const display = -t.amount;
  const isIncome = display > 0;
  const categoryLabel = t.overrideCategoryName
    ? t.overrideCategoryName
    : t.primaryCategory
      ? humanizeCategory(t.primaryCategory)
      : '—';
  const isOverridden = !!t.overrideCategoryName;

  function handleCheckboxClick(e: MouseEvent<HTMLInputElement>) {
    onToggle(t.id, index, { range: e.shiftKey });
  }

  return (
    <tr
      ref={rowRef}
      aria-selected={isSelected}
      data-checked={isChecked}
      className={cn(
        'group border-b border-border/60 transition-colors duration-fast ease-out-quart last:border-b-0',
        isChecked
          ? 'bg-accent/40 hover:bg-accent/50'
          : isSelected
            ? 'bg-surface-sunken'
            : 'hover:bg-surface-sunken/60',
      )}
    >
      <td className="w-[36px] px-3 py-1.5 text-center">
        <input
          type="checkbox"
          checked={isChecked}
          aria-label={`Select transaction at ${t.merchantName ?? t.name}`}
          onClick={handleCheckboxClick}
          // onChange is required by React but the click event carries
          // shiftKey; we let onClick own the actual toggle and stop
          // onChange from double-firing.
          onChange={() => undefined}
          className={cn(
            'h-3.5 w-3.5 cursor-pointer rounded border-border text-foreground accent-foreground',
            'opacity-0 group-hover:opacity-100 group-data-[checked=true]:opacity-100 focus-visible:opacity-100',
          )}
        />
      </td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {formatTxDate(t.date)}
      </td>
      <td className="max-w-0 px-3 py-1.5">
        <button
          type="button"
          onClick={() => onOpenDetail(t)}
          aria-label={`Open details for ${t.merchantName ?? t.name}`}
          className={cn(
            'group/cell flex w-full flex-col items-start gap-0 rounded-sm text-left',
            'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <div className="flex w-full items-center gap-2">
            <span className="truncate font-medium group-hover/cell:underline underline-offset-2">
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
        </button>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-xs">
        <span
          className={cn(
            isOverridden
              ? 'italic text-foreground/80'
              : 'text-muted-foreground',
          )}
          title={
            isOverridden && t.primaryCategory
              ? `Plaid: ${humanizeCategory(t.primaryCategory)}`
              : undefined
          }
        >
          {categoryLabel}
        </span>
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
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
  });
}

