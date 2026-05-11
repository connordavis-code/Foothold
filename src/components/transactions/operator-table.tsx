'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchX } from 'lucide-react';
import type { TransactionListRow } from '@/lib/db/queries/transactions';
import type { DayGroup } from '@/lib/transactions/group-by-date';
import { cn, formatCurrency } from '@/lib/utils';
import { CategoryChip } from './category-chip';

type Props = {
  /** Flat row list — drives ref allocation + selection indexing. */
  rows: TransactionListRow[];
  /** Pre-computed groups — drives presentational rendering only. Each
   *  group's `rows` is a slice of the flat list above. */
  groups: DayGroup[];
  selectedIndex: number;
  selectedIds: Set<string>;
  onToggle: (
    id: string,
    index: number,
    opts: { range?: boolean },
  ) => void;
  onToggleAllVisible: () => void;
};

/**
 * Operator-tier transactions table. Same multi-select + j/k DOM model
 * as before — the shell owns `rows` (flat) and selection math; this
 * component renders flat rows interleaved with `MAY 11 · MON ... -$84.27`
 * group headers from groupTransactionsByDate (T1).
 *
 * DOM SHAPE INVARIANT: one <table>, one <thead> for column titles, then
 * alternating <tbody> sections — one section per DayGroup with a
 * presentational <tr aria-hidden> header, then the day's data rows.
 * Column widths stay aligned across groups because they're owned by a
 * single <colgroup>. Headers carry NO ref + NO selection mapping — j/k
 * cursors traverse only the data rows by flat index.
 *
 * `rowIndex` is the absolute index into the shell's flat `rows[]`. We
 * derive it inside the nested map by tracking a running counter
 * (functional approach — never mutate via closure side-effect).
 */
export function OperatorTable({
  rows,
  groups,
  selectedIndex,
  selectedIds,
  onToggle,
  onToggleAllVisible,
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

  // Derive each group's first absolute index by walking the groups in
  // order. groups[0] starts at 0; groups[i] starts at the previous
  // group's start + previous group's length. Computed once per render.
  const groupStartIndices: number[] = [];
  {
    let cursor = 0;
    for (const g of groups) {
      groupStartIndices.push(cursor);
      cursor += g.rows.length;
    }
  }

  return (
    <div className="overflow-hidden rounded-card border border-[--border] bg-[--surface]">
      <div className="max-h-[calc(100vh-18rem)] overflow-auto">
        <table className="w-full text-sm">
          <colgroup>
            <col className="w-[36px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[180px]" />
            <col className="w-[160px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[--surface]/95 backdrop-blur">
            <tr className="border-b border-[--border] text-[10px] uppercase tracking-[0.12em] text-[--text-3]">
              <Th>
                <SelectAllCheckbox
                  allChecked={allChecked}
                  someChecked={someChecked}
                  disabled={rows.length === 0}
                  onToggle={onToggleAllVisible}
                />
              </Th>
              <Th className="text-left">Date</Th>
              <Th className="text-left">Description</Th>
              <Th className="text-left">Category</Th>
              <Th className="text-left">Account</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          {groups.map((group, gi) => (
            <tbody key={group.dateIso}>
              <tr
                aria-hidden
                className="border-y border-[--border]/70 bg-[--surface-sunken]/40"
              >
                <td colSpan={5} className="px-3 py-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[--text-2]">
                    {formatGroupDate(group.dateIso)}
                    <span className="mx-1.5 text-[--text-3]">·</span>
                    <span className="text-[--text-3]">{group.dayName}</span>
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <span
                    className={cn(
                      'font-mono text-[11px] tabular-nums',
                      group.dayNet > 0
                        ? 'text-[--text-2]'
                        : group.dayNet < 0
                          ? 'text-positive'
                          : 'text-[--text-3]',
                    )}
                  >
                    {formatCurrency(-group.dayNet, { signed: true })}
                  </span>
                </td>
              </tr>
              {group.rows.map((row, withinGroup) => {
                const absIndex = groupStartIndices[gi] + withinGroup;
                return (
                  <Row
                    key={row.id}
                    t={row}
                    index={absIndex}
                    isSelected={absIndex === selectedIndex}
                    isChecked={selectedIds.has(row.id)}
                    onToggle={onToggle}
                    rowRef={(el) => {
                      rowRefs.current[absIndex] = el;
                    }}
                  />
                );
              })}
            </tbody>
          ))}
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
      className="h-3.5 w-3.5 cursor-pointer rounded border-[--border] text-[--text] accent-[--text] disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function NoMatchEmpty() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hasFilters = params.size > 0;

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-[--border] bg-[--surface] px-6 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-pill bg-[--surface-sunken] text-[--text-2]">
        <SearchX className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-base font-medium text-[--text]">No transactions match</p>
        <p className="text-sm text-[--text-2]">
          {hasFilters
            ? 'Try widening the date range, switching the account, or clearing the search.'
            : 'No transactions have synced yet — try Sync now from the top bar.'}
        </p>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-xs font-medium text-[--text-2] underline-offset-4 hover:underline"
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
  rowRef: (el: HTMLTableRowElement | null) => void;
}) {
  // Plaid sign convention: positive = money OUT. Flip for display.
  const display = -t.amount;
  const isIncome = display > 0;

  function handleCheckboxClick(e: MouseEvent<HTMLInputElement>) {
    onToggle(t.id, index, { range: e.shiftKey });
  }

  return (
    <tr
      ref={rowRef}
      aria-selected={isSelected}
      data-checked={isChecked}
      className={cn(
        'group border-b border-[--border]/60 transition-colors duration-fast ease-out-quart last:border-b-0',
        isChecked
          ? 'bg-[--accent]/20 hover:bg-[--accent]/30'
          : isSelected
            ? 'bg-[--surface-sunken]'
            : 'hover:bg-[--surface-sunken]/60',
      )}
    >
      <td className="px-3 py-1.5 text-center">
        <input
          type="checkbox"
          checked={isChecked}
          aria-label={`Select transaction ${t.merchantName ?? t.name}`}
          onClick={handleCheckboxClick}
          onChange={() => undefined}
          className={cn(
            'h-3.5 w-3.5 cursor-pointer rounded border-[--border] text-[--text] accent-[--text]',
            'opacity-0 group-hover:opacity-100 group-data-[checked=true]:opacity-100 focus-visible:opacity-100',
          )}
        />
      </td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-[--text-3] whitespace-nowrap">
        {formatRowDate(t.date)}
      </td>
      <td className="max-w-0 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[--text]">
            {t.merchantName ?? t.name}
          </span>
          {t.pending && (
            <span className="shrink-0 rounded-md bg-[--surface-sunken] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[--text-3]">
              pending
            </span>
          )}
        </div>
        {t.merchantName && t.merchantName !== t.name && (
          <p className="truncate text-xs text-[--text-3]">{t.name}</p>
        )}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <CategoryChip
          primaryCategory={t.primaryCategory}
          overrideCategoryName={t.overrideCategoryName}
        />
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-[--text-2]">
        {t.accountName}
        {t.accountMask && (
          <span className="text-[--text-3]"> ····{t.accountMask}</span>
        )}
      </td>
      <td
        className={cn(
          'px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap',
          isIncome ? 'text-positive' : 'text-[--text]',
        )}
      >
        {formatCurrency(display, { signed: true })}
      </td>
    </tr>
  );
}

function formatRowDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

function formatGroupDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
