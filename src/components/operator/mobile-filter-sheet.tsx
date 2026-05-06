'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import type { AccountOption } from '@/lib/db/queries/transactions';
import { humanizeCategory } from '@/lib/format/category';
import { activeTransactionFilterCount } from '@/lib/operator/active-filter-count';
import { cn } from '@/lib/utils';

/**
 * Mobile filter sheet for /transactions. Opens from the bottom (vaul
 * Drawer), single-column controls re-using the same search-param
 * contract as FilterRow on desktop. Hidden at md+.
 *
 * Controls write directly to the URL on change (same model as
 * FilterRow); Apply just dismisses, Reset clears every filter param.
 * The trigger button shows a tabular-nums badge with the live active
 * count via `activeTransactionFilterCount`.
 */
export function MobileFilterSheet({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const initialSearch = params.get('q') ?? '';
  const [search, setSearch] = useState(initialSearch);

  function pushParams(mutator: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutator(next);
    next.delete('page');
    startTransition(() => {
      router.push(next.size ? `${pathname}?${next}` : pathname);
    });
  }

  function setParam(key: string, value: string | undefined) {
    pushParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });
  }

  // Debounce free-text search same as FilterRow.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (search === current) return;
    const timer = setTimeout(() => {
      setParam('q', search || undefined);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeCount = activeTransactionFilterCount({
    account: params.get('account'),
    category: params.get('category'),
    from: params.get('from'),
    to: params.get('to'),
    q: params.get('q'),
  });

  function reset() {
    setSearch('');
    startTransition(() => router.push(pathname));
  }

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <Button
          variant="outline"
          className="h-11 gap-1.5 rounded-pill px-4 md:hidden"
          aria-label={
            activeCount > 0
              ? `Filters, ${activeCount} active`
              : 'Filters'
          }
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-foreground px-1.5 font-mono text-[10px] tabular-nums text-background">
              {activeCount}
            </span>
          )}
        </Button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]" />
        <Drawer.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col',
            'rounded-t-card border-t border-border bg-surface-elevated',
            'pb-[env(safe-area-inset-bottom)]',
            'outline-none',
          )}
        >
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted"
          />
          <header className="flex items-center justify-between px-5 py-3">
            <Drawer.Title className="text-sm font-semibold">
              Filter transactions
            </Drawer.Title>
            <Drawer.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </Button>
            </Drawer.Close>
          </header>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
            <Field label="Search">
              <input
                type="text"
                placeholder="Merchant or description"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-card border border-border bg-surface-paper px-3 font-mono text-sm placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>

            <Field label="Account">
              <select
                className="h-11 w-full cursor-pointer rounded-card border border-border bg-surface-paper px-3 text-sm"
                value={params.get('account') ?? ''}
                onChange={(e) =>
                  setParam('account', e.target.value || undefined)
                }
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.mask ? ` ····${a.mask}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Category">
              <select
                className="h-11 w-full cursor-pointer rounded-card border border-border bg-surface-paper px-3 text-sm"
                value={params.get('category') ?? ''}
                onChange={(e) =>
                  setParam('category', e.target.value || undefined)
                }
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {humanizeCategory(c)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <input
                  type="date"
                  className="h-11 w-full cursor-pointer rounded-card border border-border bg-surface-paper px-3 text-sm"
                  value={params.get('from') ?? ''}
                  onChange={(e) =>
                    setParam('from', e.target.value || undefined)
                  }
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  className="h-11 w-full cursor-pointer rounded-card border border-border bg-surface-paper px-3 text-sm"
                  value={params.get('to') ?? ''}
                  onChange={(e) =>
                    setParam('to', e.target.value || undefined)
                  }
                />
              </Field>
            </div>
          </div>

          <footer className="flex items-center gap-3 border-t border-border px-5 py-3">
            <Button
              variant="ghost"
              onClick={reset}
              disabled={activeCount === 0}
              className="flex-1"
            >
              Reset
            </Button>
            <Drawer.Close asChild>
              <Button className="flex-1">Done</Button>
            </Drawer.Close>
          </footer>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-eyebrow">{label}</span>
      {children}
    </label>
  );
}
