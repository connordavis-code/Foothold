'use client';

import { Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import type { CategoryOption } from '@/lib/db/queries/categories';
import type { TransactionListRow } from '@/lib/db/queries/transactions';
import { humanizeCategory } from '@/lib/format/category';
import { updateTransactionCategoriesAction } from '@/lib/transactions/actions';
import { cn, formatCurrency } from '@/lib/utils';

/**
 * Mobile half-sheet detail editor for a single transaction. Opens from
 * the bottom (vaul Drawer); surfaces the row's identity, amount, and
 * an inline category-override picker. Re-categorize fires the same
 * `updateTransactionCategoriesAction` the desktop bulk-action-bar
 * uses (with a single-row id list); toast carries an Undo affordance.
 *
 * Open state is controlled by the parent so the row-tap on
 * <MobileList> can drive it. Pass `row={null}` to dismiss.
 */
export function TransactionDetailSheet({
  row,
  categoryOptions,
  onClose,
}: {
  row: TransactionListRow | null;
  categoryOptions: CategoryOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const open = row !== null;

  const userOpts = categoryOptions.filter((o) => o.source === 'user');
  const pfcOpts = categoryOptions.filter((o) => o.source === 'pfc');

  function applyCategory(name: string | null) {
    if (!row) return;
    const prior = row.overrideCategoryName;
    startTransition(async () => {
      try {
        const { updated } = await updateTransactionCategoriesAction(
          [row.id],
          name,
        );
        if (updated === 0) {
          toast.error('Could not re-categorize. Try again?');
          return;
        }
        toast.success(
          name
            ? `Re-categorized as “${name}”.`
            : 'Cleared category override.',
          {
            action: {
              label: 'Undo',
              onClick: async () => {
                try {
                  await updateTransactionCategoriesAction([row.id], prior);
                  toast.success('Undone.');
                  router.refresh();
                } catch {
                  toast.error('Undo failed. The change is still applied.');
                }
              },
            },
          },
        );
        onClose();
        router.refresh();
      } catch {
        toast.error('Re-categorize failed. Try again in a moment.');
      }
    });
  }

  // Plaid sign convention: positive = money OUT. Flip for display.
  const display = row ? -row.amount : 0;
  const isIncome = display > 0;
  const currentLabel = row?.overrideCategoryName
    ? row.overrideCategoryName
    : row?.primaryCategory
      ? humanizeCategory(row.primaryCategory)
      : '—';

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
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
          {row && (
            <>
              <header className="flex items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Drawer.Title className="truncate text-base font-semibold">
                    {row.merchantName ?? row.name}
                  </Drawer.Title>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatLong(row.date)}
                    <span aria-hidden> · </span>
                    {row.accountName}
                    {row.accountMask && (
                      <span className="text-muted-foreground/70">
                        {' ····'}
                        {row.accountMask}
                      </span>
                    )}
                  </p>
                </div>
                <Drawer.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close detail"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </Drawer.Close>
              </header>

              <div className="px-5 pb-2">
                <p
                  className={cn(
                    'font-mono text-3xl font-semibold tabular-nums',
                    isIncome ? 'text-positive' : 'text-foreground',
                  )}
                >
                  {formatCurrency(display, { signed: true })}
                </p>
                {row.pending && (
                  <span className="mt-1 inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    pending
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5">
                <div>
                  <p className="text-eyebrow">Category</p>
                  <p className="mt-1 text-sm">
                    <span
                      className={cn(
                        row.overrideCategoryName
                          ? 'italic text-foreground'
                          : 'text-foreground',
                      )}
                    >
                      {currentLabel}
                    </span>
                    {row.overrideCategoryName && row.primaryCategory && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        Plaid: {humanizeCategory(row.primaryCategory)}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  {row.overrideCategoryName && (
                    <CategoryOptionRow
                      label="Clear override"
                      muted
                      onSelect={() => applyCategory(null)}
                      disabled={isPending}
                      isCurrent={false}
                      kind="clear"
                    />
                  )}
                  {userOpts.length > 0 && (
                    <SectionHeader>Your categories</SectionHeader>
                  )}
                  {userOpts.map((o) => (
                    <CategoryOptionRow
                      key={`u-${o.id ?? o.name}`}
                      label={o.name}
                      onSelect={() => applyCategory(o.name)}
                      disabled={isPending}
                      isCurrent={o.name === row.overrideCategoryName}
                      kind="user"
                    />
                  ))}
                  {pfcOpts.length > 0 && (
                    <SectionHeader>From Plaid</SectionHeader>
                  )}
                  {pfcOpts.map((o) => (
                    <CategoryOptionRow
                      key={`p-${o.name}`}
                      label={o.name}
                      onSelect={() => applyCategory(o.name)}
                      disabled={isPending}
                      isCurrent={o.name === row.overrideCategoryName}
                      kind="pfc"
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-eyebrow">{children}</p>
  );
}

function CategoryOptionRow({
  label,
  onSelect,
  disabled,
  isCurrent,
  muted,
}: {
  label: string;
  onSelect: () => void;
  disabled: boolean;
  isCurrent: boolean;
  muted?: boolean;
  kind: 'user' | 'pfc' | 'clear';
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex min-h-[44px] items-center justify-between gap-2 rounded-card px-3 py-2 text-left text-sm transition-colors duration-fast ease-out-quart',
        muted
          ? 'text-muted-foreground hover:bg-surface-sunken'
          : 'hover:bg-surface-sunken',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <span className="truncate">{label}</span>
      {isCurrent && <Check className="h-4 w-4 text-foreground" />}
    </button>
  );
}

function formatLong(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
