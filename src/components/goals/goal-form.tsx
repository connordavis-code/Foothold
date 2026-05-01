'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Goal } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

const SELECT_CLASS = cn(
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
  'text-sm ring-offset-background',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
);

export type AccountOption = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
};

/**
 * Shared create/edit goal form. The parent server action is bound by the
 * caller — `action` here is whatever server action (`createGoal` or a
 * pre-bound `updateGoal.bind(null, id)`) the page wants to dispatch to.
 */
export function GoalForm({
  action,
  accounts,
  categories,
  initial,
  errorMessage,
  cancelHref = '/goals',
  submitLabel = 'Save goal',
}: {
  action: (formData: FormData) => void | Promise<void>;
  accounts: AccountOption[];
  categories: string[];
  initial?: Pick<
    Goal,
    | 'type'
    | 'name'
    | 'targetAmount'
    | 'monthlyAmount'
    | 'accountIds'
    | 'categoryFilter'
    | 'targetDate'
  >;
  errorMessage?: string;
  cancelHref?: string;
  submitLabel?: string;
}) {
  const [type, setType] = useState<'savings' | 'spend_cap'>(
    (initial?.type as 'savings' | 'spend_cap') ?? 'savings',
  );

  // Savings goals can only target asset accounts (depository / investment).
  // Spend-cap goals make sense for any spending account (depository / credit).
  const accountsForType =
    type === 'savings'
      ? accounts.filter(
          (a) => a.type === 'depository' || a.type === 'investment',
        )
      : accounts.filter((a) => a.type === 'depository' || a.type === 'credit');

  const initialAccountIds = new Set(initial?.accountIds ?? []);
  const initialCategories = new Set(initial?.categoryFilter ?? []);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="type" value={type} />

      <div className="space-y-2">
        <Label>Goal type</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <TypeRadio
            checked={type === 'savings'}
            onChange={() => setType('savings')}
            title="Savings target"
            description="Accumulate to a dollar amount across one or more accounts."
          />
          <TypeRadio
            checked={type === 'spend_cap'}
            onChange={() => setType('spend_cap')}
            title="Monthly spend cap"
            description="Stay under a monthly limit, optionally per category."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ''}
          placeholder={
            type === 'savings'
              ? 'e.g. Emergency fund, House down payment'
              : 'e.g. Discretionary cap, Eating out'
          }
        />
      </div>

      {type === 'savings' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="targetAmount">Target amount</Label>
            <Input
              id="targetAmount"
              name="targetAmount"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={initial?.targetAmount ?? ''}
              placeholder="10000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetDate">Target date (optional)</Label>
            <input
              id="targetDate"
              name="targetDate"
              type="date"
              defaultValue={initial?.targetDate ?? ''}
              className={SELECT_CLASS}
            />
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="monthlyAmount">Monthly limit</Label>
          <Input
            id="monthlyAmount"
            name="monthlyAmount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initial?.monthlyAmount ?? ''}
            placeholder="500"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>
          {type === 'savings'
            ? 'Accounts to count toward this goal'
            : 'Accounts to track (leave all unchecked for any account)'}
        </Label>
        {accountsForType.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No eligible accounts. Connect one in Settings first.
          </p>
        ) : (
          <ul className="rounded-md border border-border divide-y divide-border">
            {accountsForType.map((a) => (
              <li key={a.id} className="px-3 py-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="accountIds"
                    value={a.id}
                    defaultChecked={initialAccountIds.has(a.id)}
                    className="h-4 w-4"
                  />
                  <span className="flex-1">
                    <span className="text-sm font-medium">{a.name}</span>
                    {a.mask && (
                      <span className="text-sm text-muted-foreground">
                        {' ····'}
                        {a.mask}
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground capitalize">
                      {a.subtype ?? a.type}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {type === 'spend_cap' && (
        <div className="space-y-2">
          <Label>Category filter (leave all unchecked for all categories)</Label>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No categorized transactions yet. Once you sync, categories
              will appear here.
            </p>
          ) : (
            <ul className="rounded-md border border-border divide-y divide-border max-h-72 overflow-auto">
              {categories.map((c) => (
                <li key={c} className="px-3 py-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="categoryFilter"
                      value={c}
                      defaultChecked={initialCategories.has(c)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{humanize(c)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit">{submitLabel}</Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function TypeRadio({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        'rounded-md border p-3 text-left transition-colors',
        checked
          ? 'border-primary bg-accent/40'
          : 'border-border hover:bg-accent/30',
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </button>
  );
}

function humanize(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
