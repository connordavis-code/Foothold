'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import type { CategoryOption } from '@/lib/db/queries/categories';
import {
  type AccountOption,
  type TransactionListRow,
} from '@/lib/db/queries/transactions';
import { groupTransactionsByDate } from '@/lib/transactions/group-by-date';
import { loadMoreTransactionsAction } from '@/lib/transactions/actions';
import { cn, formatCurrency } from '@/lib/utils';
import { MobileFilterSheet } from '@/components/operator/mobile-filter-sheet';
import { CategoryChip } from './category-chip';
import { TransactionDetailSheet } from './transaction-detail-sheet';

/**
 * Mobile-only shell for /transactions. Pairs with <OperatorShell>
 * (desktop) under a CSS swap on the page. Owns:
 *
 *  - Search input (debounced URL push), Filters button (active count)
 *  - Date-grouped row rendering via groupTransactionsByDate (T1) —
 *    same source of truth as desktop. Group re-computation runs on
 *    every render of allRows so appended pages merge cleanly into
 *    the existing groups (rather than re-grouping just the appended
 *    chunk, which would visually duplicate group headers at page
 *    boundaries).
 *  - <TransactionDetailSheet> half-sheet edit on row tap
 *  - Infinite scroll: IntersectionObserver sentinel triggers
 *    loadMoreTransactionsAction; appended rows live in local state.
 *
 * Reset of appended rows happens whenever initialRows changes (route
 * navigation refreshes the SSR render under the same filter), so
 * re-categorize → router.refresh() doesn't leave stale appended rows.
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

  useEffect(() => {
    setAppended([]);
    setNextPage(initialPage + 1);
    setHasMore(initialPage < totalPages);
  }, [initialRows, initialPage, totalPages]);

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
      // Silent: sentinel will retry on next intersection.
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

  const allRows = useMemo(
    () => (appended.length === 0 ? initialRows : [...initialRows, ...appended]),
    [initialRows, appended],
  );
  const groups = useMemo(() => groupTransactionsByDate(allRows), [allRows]);

  return (
    <div className="space-y-3 md:hidden">
      <div className="sticky top-14 z-10 -mx-4 flex items-center gap-2 border-b border-border bg-[--surface]/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--text-3]"
          />
          <input
            type="search"
            placeholder="Search transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-pill border border-border bg-[--surface] pl-9 pr-3 font-mono text-sm text-[--text] placeholder:font-sans placeholder:text-[--text-3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <MobileFilterSheet accounts={accounts} categories={categories} />
      </div>

      <p className="px-1 text-xs text-[--text-3]">
        {totalCount.toLocaleString()}{' '}
        {totalCount === 1 ? 'transaction' : 'transactions'}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-card border border-border bg-[--surface] px-4 py-12 text-center text-sm text-[--text-2]">
          {params.size > 0
            ? 'No transactions match these filters.'
            : 'No transactions synced yet.'}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.dateIso} className="space-y-1.5">
              <header className="flex items-baseline justify-between px-1">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[--text-2]">
                    {formatMobileGroupDate(group.dateIso)}
                  </span>
                  <span className="ml-1.5 text-[11px] text-[--text-3]">
                    · {group.dayName}
                  </span>
                </div>
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
              </header>
              <ul className="overflow-hidden rounded-card border border-border bg-[--surface]">
                {group.rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setActive(r)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-[--surface-sunken]/60"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[--text]">
                            {r.merchantName ?? r.name}
                          </span>
                          {r.pending && (
                            <span className="shrink-0 rounded-md bg-[--surface-sunken] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[--text-3]">
                              pending
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[--text-3]">
                          <CategoryChip
                            primaryCategory={r.primaryCategory}
                            overrideCategoryName={r.overrideCategoryName}
                            size="xs"
                          />
                          <span>·</span>
                          <span className="truncate">{r.accountName}</span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 font-mono text-sm tabular-nums',
                          -r.amount > 0 ? 'text-positive' : 'text-[--text]',
                        )}
                      >
                        {formatCurrency(-r.amount, { signed: true })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden
          className="h-12 w-full"
        />
      )}
      {loading && (
        <p className="py-2 text-center text-xs text-[--text-3]">
          Loading more…
        </p>
      )}
      {!hasMore && groups.length > 0 && (
        <p className="py-3 text-center text-[11px] uppercase tracking-[0.12em] text-[--text-3]/80">
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

function formatMobileGroupDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
