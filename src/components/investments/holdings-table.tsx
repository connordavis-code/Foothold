'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { FlatHolding } from '@/lib/db/queries/investments';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';
import { GroupByToggle, type GroupBy } from './group-by-toggle';

type SortField = 'value' | 'ticker' | 'quantity' | 'price' | 'gainLoss' | 'account';
type SortDir = 'asc' | 'desc';

type Props = {
  holdings: FlatHolding[];
};

/**
 * Operator-tier holdings table. Flat by default; group-by toggle clusters
 * rows by account or asset type without leaving the table (no separate
 * cards). Sortable columns — click to cycle asc/desc/default. Mono
 * numerals for ticker, qty, price, value, gain/loss; sans for the
 * account label and asset type.
 *
 * Day delta is shown in a Today column when prices are available; falls
 * back to "—" otherwise. Cost-basis column intentionally omitted from
 * the visible default — the unrealized-gain column already encodes it,
 * and cost basis as its own column makes the table feel cluttered.
 */
export function HoldingsTable({ holdings }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>('flat');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function clickSort(field: SortField) {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    const rows = [...holdings];
    rows.sort((a, b) => {
      const va = sortValue(a, sortField);
      const vb = sortValue(b, sortField);
      const dir = sortDir === 'asc' ? 1 : -1;
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls always last
      if (vb == null) return -1;
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
    return rows;
  }, [holdings, sortField, sortDir]);

  const groups = useMemo(() => groupRows(sorted, groupBy), [sorted, groupBy]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface-elevated px-6 py-16 text-center text-sm text-muted-foreground">
        No holdings reported yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-eyebrow">
          Holdings · {holdings.length}
        </p>
        <GroupByToggle value={groupBy} onChange={setGroupBy} />
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
        <div className="max-h-[calc(100vh-22rem)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur">
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
                <SortableTh
                  field="ticker"
                  current={sortField}
                  dir={sortDir}
                  onClick={clickSort}
                  className="w-[110px] text-left"
                >
                  Ticker
                </SortableTh>
                <Th className="text-left">Name</Th>
                <SortableTh
                  field="quantity"
                  current={sortField}
                  dir={sortDir}
                  onClick={clickSort}
                  className="w-[110px] text-right"
                >
                  Qty
                </SortableTh>
                <SortableTh
                  field="price"
                  current={sortField}
                  dir={sortDir}
                  onClick={clickSort}
                  className="w-[110px] text-right"
                >
                  Price
                </SortableTh>
                <SortableTh
                  field="value"
                  current={sortField}
                  dir={sortDir}
                  onClick={clickSort}
                  className="w-[130px] text-right"
                >
                  Value
                </SortableTh>
                <Th className="w-[110px] text-right">Today</Th>
                <SortableTh
                  field="gainLoss"
                  current={sortField}
                  dir={sortDir}
                  onClick={clickSort}
                  className="w-[130px] text-right"
                >
                  Gain / loss
                </SortableTh>
                {groupBy !== 'account' && (
                  <SortableTh
                    field="account"
                    current={sortField}
                    dir={sortDir}
                    onClick={clickSort}
                    className="w-[180px] text-left"
                  >
                    Account
                  </SortableTh>
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <RowGroup
                  key={group.label ?? 'flat'}
                  group={group}
                  showAccount={groupBy !== 'account'}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type Group = {
  label: string | null;
  rows: FlatHolding[];
};

function groupRows(rows: FlatHolding[], groupBy: GroupBy): Group[] {
  if (groupBy === 'flat') {
    return [{ label: null, rows }];
  }
  const map = new Map<string, FlatHolding[]>();
  for (const r of rows) {
    const key =
      groupBy === 'account'
        ? `${r.accountName}${r.accountMask ? ` ····${r.accountMask}` : ''}`
        : prettifyType(r.securityType);
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  // Order groups by aggregate market value desc — independent of the
  // within-group sortField. Prior behavior fell back to Map insertion
  // order, which is "whichever group contains the first row in the
  // sorted list" — close to value-desc by accident, wrong as soon as a
  // small group's top holding outranks a giant group's top holding.
  return Array.from(map.entries())
    .map(([label, groupRows]) => ({
      label,
      rows: groupRows,
      aggregate: groupRows.reduce(
        (sum, r) => sum + (r.institutionValue ?? 0),
        0,
      ),
    }))
    .sort((a, b) => b.aggregate - a.aggregate)
    .map(({ label, rows: groupRows }) => ({ label, rows: groupRows }));
}

function RowGroup({
  group,
  showAccount,
}: {
  group: Group;
  showAccount: boolean;
}) {
  return (
    <>
      {group.label && (
        <tr className="bg-surface-sunken/50">
          <td
            colSpan={showAccount ? 8 : 7}
            className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80"
          >
            {group.label}
            <span className="ml-2 text-muted-foreground/60 normal-case tracking-normal">
              {group.rows.length}{' '}
              {group.rows.length === 1 ? 'position' : 'positions'}
            </span>
          </td>
        </tr>
      )}
      {group.rows.map((h) => (
        <Row key={h.id} h={h} showAccount={showAccount} />
      ))}
    </>
  );
}

function Row({
  h,
  showAccount,
}: {
  h: FlatHolding;
  showAccount: boolean;
}) {
  const gl =
    h.costBasis != null && h.institutionValue != null
      ? h.institutionValue - h.costBasis
      : null;
  const glPct = gl != null && h.costBasis ? gl / h.costBasis : null;

  return (
    <tr className="border-b border-border/60 transition-colors duration-fast ease-out-quart hover:bg-surface-sunken/60 last:border-b-0">
      <td className="px-3 py-1.5 font-mono text-xs font-medium text-foreground whitespace-nowrap">
        {h.ticker ?? '—'}
      </td>
      <td className="max-w-0 px-3 py-1.5">
        <p className="truncate">{h.securityName ?? '—'}</p>
        {h.securityType && (
          <p className="truncate text-xs text-muted-foreground">
            {prettifyType(h.securityType)}
          </p>
        )}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {h.institutionPrice != null
          ? formatCurrency(h.institutionPrice)
          : '—'}
      </td>
      <td className="px-3 py-1.5 text-right font-mono tabular-nums font-medium whitespace-nowrap">
        {h.institutionValue != null
          ? formatCurrency(h.institutionValue)
          : '—'}
      </td>
      <td
        className={cn(
          'px-3 py-1.5 text-right font-mono text-xs tabular-nums whitespace-nowrap',
          h.dayDelta == null
            ? 'text-muted-foreground'
            : h.dayDelta >= 0
              ? 'text-positive'
              : 'text-destructive',
        )}
      >
        {h.dayDelta == null
          ? '—'
          : formatCurrency(h.dayDelta, { signed: true })}
      </td>
      <td
        className={cn(
          'px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap',
          gl == null
            ? 'text-muted-foreground'
            : gl >= 0
              ? 'text-positive'
              : 'text-destructive',
        )}
      >
        {gl == null ? (
          '—'
        ) : (
          <>
            {formatCurrency(gl, { signed: true })}
            {glPct != null && (
              <div className="text-[10px] opacity-80">
                {formatPercent(glPct)}
              </div>
            )}
          </>
        )}
      </td>
      {showAccount && (
        <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
          {h.accountName}
          {h.accountMask && (
            <span className="text-muted-foreground/70"> ····{h.accountMask}</span>
          )}
        </td>
      )}
    </tr>
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
    <th className={cn('px-3 py-2 font-medium', className)} scope="col">
      {children}
    </th>
  );
}

function SortableTh({
  field,
  current,
  dir,
  onClick,
  className,
  children,
}: {
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (field: SortField) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const isActive = field === current;
  const Icon = isActive ? (dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th className={cn('px-3 py-2 font-medium', className)} scope="col">
      <button
        type="button"
        onClick={() => onClick(field)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors duration-fast ease-out-quart hover:text-foreground',
          className?.includes('text-right') && 'justify-end',
          isActive && 'text-foreground',
        )}
      >
        {children}
        <Icon className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}

function sortValue(
  h: FlatHolding,
  field: SortField,
): number | string | null {
  switch (field) {
    case 'value':
      return h.institutionValue;
    case 'ticker':
      return h.ticker;
    case 'quantity':
      return h.quantity;
    case 'price':
      return h.institutionPrice;
    case 'gainLoss':
      return h.costBasis != null && h.institutionValue != null
        ? h.institutionValue - h.costBasis
        : null;
    case 'account':
      return h.accountName;
  }
}

function prettifyType(t: string | null): string {
  if (!t) return 'Other';
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
}
