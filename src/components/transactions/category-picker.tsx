'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { CategoryOption } from '@/lib/db/queries/categories';
import { cn } from '@/lib/utils';

type Props = {
  options: CategoryOption[];
  onApply: (name: string | null) => void;
  busy?: boolean;
};

/**
 * Inline category picker for the bulk-action bar. Uses cmdk under
 * the hood so search is fuzzy and the keyboard story is consistent
 * with the ⌘K palette. The "Clear category" item at the top is the
 * affordance for reverting to the raw Plaid PFC.
 *
 * Options are split into two groups: user categories (rows that
 * already exist in the categories table) and Plaid PFC suggestions
 * (humanized strings observed on transactions). Picking a PFC
 * implicitly creates a categories row at apply time.
 */
export function CategoryPicker({ options, onApply, busy }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  // Reset the search input when the popover closes.
  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  const userOpts = options.filter((o) => o.source === 'user');
  const pfcOpts = options.filter((o) => o.source === 'pfc');

  function pick(name: string | null) {
    onApply(name);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-card border border-border bg-surface-elevated px-3 text-xs font-medium',
            'transition-colors duration-fast ease-out-quart hover:border-foreground/20 hover:text-foreground',
            'disabled:opacity-60 disabled:cursor-default',
          )}
        >
          Re-categorize
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command shouldFilter>
          <CommandInput
            placeholder="Search categories…"
            value={value}
            onValueChange={setValue}
          />
          <CommandList>
            <CommandEmpty>No categories.</CommandEmpty>

            <CommandGroup>
              <CommandItem
                value="__clear"
                onSelect={() => pick(null)}
                className="text-muted-foreground"
              >
                <X className="mr-2 h-4 w-4 opacity-70" />
                Clear category override
              </CommandItem>
            </CommandGroup>

            {userOpts.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Your categories">
                  {userOpts.map((o) => (
                    <CommandItem
                      key={`u-${o.id ?? o.name}`}
                      value={o.name}
                      onSelect={() => pick(o.name)}
                    >
                      {o.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {pfcOpts.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="From Plaid">
                  {pfcOpts.map((o) => (
                    <CommandItem
                      key={`p-${o.name}`}
                      value={o.name}
                      onSelect={() => pick(o.name)}
                    >
                      {o.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
