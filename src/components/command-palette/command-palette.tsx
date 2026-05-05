'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { navGroups, settingsItem } from '@/components/nav/nav-routes';
import { syncAllItemsAction } from '@/lib/plaid/actions';
import {
  searchTransactionsAction,
  type TransactionSearchHit,
} from '@/lib/transactions/actions';
import { formatCurrency } from '@/lib/utils';
import { useCommandPalette } from './palette-context';

const SEARCH_DEBOUNCE_MS = 200;

/**
 * The ⌘K palette UI. Three sections:
 *
 *  - Navigate: links to every primary surface (sourced from
 *    nav-routes.ts so the palette stays in lockstep with the sidebar).
 *  - Search: live transaction search (debounced server action). Hidden
 *    until the user types ≥2 characters.
 *  - Actions: one-shot operations like "Sync now". Replaces the
 *    sidebar-buried buttons with keyboard-driven access.
 *
 * Mounted once at the layout root; opens via context (⌘K hotkey or
 * top-bar trigger). Selections close the palette and either navigate
 * or fire a transition.
 */
export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<TransactionSearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Reset query when the palette closes — opening fresh shouldn't
  // remember the prior search.
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setHits([]);
    }
  }, [isOpen]);

  // Debounced live search.
  useEffect(() => {
    if (!isOpen) return;
    if (query.trim().length < 2) {
      setHits([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchTransactionsAction(query);
        setHits(results);
      } catch {
        setHits([]);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  function go(href: string) {
    close();
    router.push(href);
  }

  function syncNow() {
    close();
    startTransition(async () => {
      try {
        const { synced, failed } = await syncAllItemsAction();
        if (failed > 0) {
          toast.error(`Synced ${synced}, ${failed} failed.`);
        } else if (synced === 0) {
          toast('No banks connected yet.');
        } else {
          toast.success(
            synced === 1 ? 'Bank synced.' : `Synced ${synced} banks.`,
          );
        }
        router.refresh();
      } catch {
        toast.error('Sync failed. Try again in a minute.');
      }
    });
  }

  const showHits = query.trim().length >= 2;

  return (
    <CommandDialog open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <CommandInput
        placeholder="Type to search or jump to a page…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isSearching ? 'Searching…' : 'No results.'}
        </CommandEmpty>

        {showHits && hits.length > 0 && (
          <>
            <CommandGroup heading="Transactions">
              {hits.map((h) => (
                <CommandItem
                  key={h.id}
                  value={`tx-${h.id} ${h.merchantName ?? h.name}`}
                  onSelect={() => go(`/transactions?q=${encodeURIComponent(h.merchantName ?? h.name)}`)}
                >
                  <Search className="mr-2 h-4 w-4 opacity-60" />
                  <span className="flex-1 truncate">
                    {h.merchantName ?? h.name}
                  </span>
                  <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(-h.amount, { signed: true })}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigate">
          {navGroups.flatMap((g) =>
            g.items.map((item) => (
              <CommandItem
                key={item.href}
                value={`nav-${item.href} ${item.label} ${g.label}`}
                onSelect={() => go(item.href)}
              >
                <item.icon className="mr-2 h-4 w-4 opacity-70" />
                <span>{item.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {g.label}
                </span>
              </CommandItem>
            )),
          )}
          <CommandItem
            value={`nav-${settingsItem.href} ${settingsItem.label}`}
            onSelect={() => go(settingsItem.href)}
          >
            <settingsItem.icon className="mr-2 h-4 w-4 opacity-70" />
            <span>{settingsItem.label}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            value="action-sync-now"
            onSelect={syncNow}
            disabled={isPending}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 opacity-70 ${isPending ? 'animate-spin' : ''}`}
            />
            <span>Sync now</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
