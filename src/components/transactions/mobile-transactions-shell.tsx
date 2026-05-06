'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { CategoryOption } from '@/lib/db/queries/categories';
import {
  type AccountOption,
  type TransactionListRow,
} from '@/lib/db/queries/transactions';
import { humanizeCategory } from '@/lib/format/category';
import { loadMoreTransactionsAction } from '@/lib/transactions/actions';
import { cn, formatCurrency } from '@/lib/utils';
import { MobileFilterSheet } from '@/components/operator/mobile-filter-sheet';
import { MobileList } from '@/components/operator/mobile-list';
import { TransactionDetailSheet } from './transaction-detail-sheet';

/**
 * Mobile-only shell for /transactions. Pairs with <OperatorShell>
 * (desktop) under a CSS swap on the page. Owns:
 *
 *  - Search input (debounced URL push), Filters button (active count)
 *  - <MobileList> render with date sections
 *  - <TransactionDetailSheet> half-sheet edit on row tap
 *  - Infinite scroll: IntersectionObserver sentinel triggers
 *    loadMoreTransactionsAction; appended rows live in local state
 *    and merge with the initial server render
 *
 * Reset of appended rows happens whenever the underlying initialRows
 * changes (route navigation refreshes the SSR render under the same
 * filter), so re-categorize → router.refresh() doesn't leave stale
 * appended rows from the prior fetch.
 */
export function MobileTransactionsShell({
  initialRows,
  accounts,
  categories,
  categoryOptions,
  initialPage,
  totalPages,
  totalCount,
  filters,
}: {
  initialRows: TransactionListRow[];
  accounts: AccountOption[];
  categories: string[];
  categoryOptions: CategoryOption[];
  initialPage: number;
  totalPages: number;
  totalCount: number;
  filters: {
    accountId?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get('q') ?? '');
  const [appended, setAppended] = useState<TransactionListRow[]>([]);
  const [nextPage, setNextPage] = useState(initialPage + 1);
  const [hasMore, setHasMore] = useState(initialPage < totalPages);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<TransactionListRow | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // SSR render (initialRows) changes whenever filters / refresh happen.
  // Drop appended rows so we don't show stale or duplicated entries.
  useEffect(() => {
    setAppended([]);
    setNextPage(initialPage + 1);
    setHasMore(initialPage < totalPages);
  }, [initialRows, initialPage, totalPages]);

  // Debounced search input → URL.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (search === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search) next.set('q', search);
      else next.delete('q');
      next.delete('page');
      startTransition(() => {
        router.push(next.size ? `${pathname}?${next}` : pathname);
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const result = await loadMoreTransactionsAction(filters, nextPage);
      setAppended((prev) => [...prev, ...result.rows]);
      setNextPage((p) => p + 1);
      setHasMore(result.hasMore);
    } catch {
      // Surface silently — sentinel will retry on next intersection.
      // Toasting on every chunk failure spams the user.
    } finally {
      setLoading(false);
    }
  }, [filters, hasMore, loading, nextPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMore();
          }
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const allRows = appended.length === 0
    ? initialRows
    : [...initialRows, ...appended];

  return (
    <div className="space-y-3 md:hidden">
      <div className="sticky top-14 z-10 -mx-4 flex items-center gap-2 border-b border-border bg-surface-paper/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder="Search transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-pill border border-border bg-surface-elevated pl-9 pr-3 font-mono text-sm placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <MobileFilterSheet accounts={accounts} categories={categories} />
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        {totalCount.toLocaleString()}{' '}
        {totalCount === 1 ? 'transaction' : 'transactions'}
      </p>

      <MobileList<TransactionListRow>
        rows={allRows}
        config={{
          rowKey: (r) => r.id,
          dateField: (r) => r.date,
          topLine: (r) => (
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">
                {r.merchantName ?? r.name}
              </span>
              {r.pending && (
                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  pending
                </span>
              )}
            </span>
          ),
          secondLine: (r) => {
            const cat = r.overrideCategoryName
              ? r.overrideCategoryName
              : r.primaryCategory
                ? humanizeCategory(r.primaryCategory)
                : '—';
            return `${cat} · ${r.accountName}`;
          },
          rightCell: (r) => {
            const display = -r.amount;
            const isIncome = display > 0;
            return (
              <span className={cn(isIncome && 'text-positive')}>
                {formatCurrency(display, { signed: true })}
              </span>
            );
          },
          onRowTap: (r) => setActive(r),
        }}
        empty={
          <div className="rounded-card border border-border bg-surface-elevated px-4 py-12 text-center text-sm text-muted-foreground">
            {params.size > 0
              ? 'No transactions match these filters.'
              : 'No transactions synced yet.'}
          </div>
        }
      />

      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden
          className="h-12 w-full"
        />
      )}
      {loading && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Loading more…
        </p>
      )}
      {!hasMore && allRows.length > 0 && (
        <p className="py-3 text-center text-[11px] uppercase tracking-[0.08em] text-muted-foreground/60">
          End of list
        </p>
      )}

      <TransactionDetailSheet
        row={active}
        categoryOptions={categoryOptions}
        onClose={() => setActive(null)}
      />
    </div>
  );
}
