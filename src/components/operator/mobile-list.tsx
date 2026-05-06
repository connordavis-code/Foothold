'use client';

import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import { humanizeDate } from '@/lib/format/date';
import {
  type DateSection,
  groupByDate,
} from '@/lib/operator/group-by-date';
import { cn } from '@/lib/utils';

/**
 * Generic two-line stacked list for mobile renders of operator-tier
 * tables. Used by /transactions, /investments (holdings + recent txns),
 * and /drift flag-history. Spec §7 + brainstorm visual companion;
 * paired with the desktop OperatorTable via the CSS-only swap pattern
 * (`hidden md:block` on the table, `block md:hidden` on this list).
 *
 * Date grouping is opt-in: pass `dateField` to get section headers
 * via humanizeDate (transactions, drift); omit it for flat lists where
 * rows have no temporal anchor (holdings).
 *
 * Each row is a 60px-min tap target. `rowHref` produces a stretched
 * <Link> drilldown (transactions → detail sheet on tap is handled by
 * the consumer wrapping rows via `onRowTap` instead). Pick one — both
 * set is unsupported.
 */
export type MobileListConfig<T> = {
  rowKey: (row: T) => string;
  topLine: (row: T) => ReactNode;
  secondLine?: (row: T) => ReactNode;
  rightCell: (row: T) => ReactNode;
  rightSubCell?: (row: T) => ReactNode;
  /** YYYY-MM-DD; if omitted, the list renders flat (no section headers). */
  dateField?: (row: T) => string;
  rowHref?: (row: T) => string;
  onRowTap?: (row: T) => void;
};

type Props<T> = {
  rows: T[];
  config: MobileListConfig<T>;
  empty?: ReactNode;
};

export function MobileList<T>({ rows, config, empty }: Props<T>) {
  const sections = useMemo<DateSection<T>[] | null>(() => {
    if (!config.dateField) return null;
    return groupByDate(rows, config.dateField);
  }, [rows, config]);

  if (rows.length === 0) {
    return (
      <div className="md:hidden">
        {empty ?? (
          <div className="rounded-card border border-border bg-surface-elevated px-4 py-12 text-center text-sm text-muted-foreground">
            Nothing to show.
          </div>
        )}
      </div>
    );
  }

  if (sections) {
    return (
      <div className="md:hidden">
        <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
          {sections.map((section, idx) => (
            <Section
              key={section.dateKey}
              section={section}
              config={config}
              isFirst={idx === 0}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="md:hidden">
      <div className="overflow-hidden rounded-card border border-border bg-surface-elevated">
        <ul role="list" className="divide-y divide-border/60">
          {rows.map((row) => (
            <Row key={config.rowKey(row)} row={row} config={config} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function Section<T>({
  section,
  config,
  isFirst,
}: {
  section: DateSection<T>;
  config: MobileListConfig<T>;
  isFirst: boolean;
}) {
  return (
    <section
      className={cn(
        !isFirst && 'border-t border-border',
      )}
    >
      <header className="bg-surface-sunken/50 px-4 py-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
        {humanizeDate(section.dateKey)}
      </header>
      <ul role="list" className="divide-y divide-border/60">
        {section.items.map((row) => (
          <Row key={config.rowKey(row)} row={row} config={config} />
        ))}
      </ul>
    </section>
  );
}

function Row<T>({
  row,
  config,
}: {
  row: T;
  config: MobileListConfig<T>;
}) {
  const top = config.topLine(row);
  const second = config.secondLine?.(row);
  const right = config.rightCell(row);
  const rightSub = config.rightSubCell?.(row);
  const href = config.rowHref?.(row);

  const inner = (
    <div className="flex min-h-[60px] items-start gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="truncate text-sm text-foreground">{top}</div>
        {second != null && (
          <div className="truncate text-xs text-muted-foreground">
            {second}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <div className="font-mono text-sm tabular-nums">{right}</div>
        {rightSub != null && (
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {rightSub}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <li>
        <Link
          href={href}
          className="block transition-colors duration-fast ease-out-quart hover:bg-surface-sunken/60 active:bg-surface-sunken focus-visible:outline-none focus-visible:bg-surface-sunken"
        >
          {inner}
        </Link>
      </li>
    );
  }

  if (config.onRowTap) {
    const tap = config.onRowTap;
    return (
      <li>
        <button
          type="button"
          onClick={() => tap(row)}
          className="block w-full text-left transition-colors duration-fast ease-out-quart hover:bg-surface-sunken/60 active:bg-surface-sunken focus-visible:outline-none focus-visible:bg-surface-sunken"
        >
          {inner}
        </button>
      </li>
    );
  }

  return <li>{inner}</li>;
}
