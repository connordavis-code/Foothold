'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { sourceScopeWhere } from '@/lib/db/source-scope';
import { externalItems, financialAccounts, goals } from '@/lib/db/schema';

const SavingsInput = z.object({
  type: z.literal('savings'),
  name: z.string().min(1, 'Name is required').max(100),
  targetAmount: z
    .string()
    .min(1, 'Target amount is required')
    .refine((s) => !Number.isNaN(Number(s)) && Number(s) > 0, 'Must be > 0'),
  accountIds: z.array(z.string()).min(1, 'Pick at least one account'),
  targetDate: z
    .string()
    .optional()
    .transform((s) => (s ? s : null)),
});

const SpendCapInput = z.object({
  type: z.literal('spend_cap'),
  name: z.string().min(1, 'Name is required').max(100),
  monthlyAmount: z
    .string()
    .min(1, 'Monthly amount is required')
    .refine((s) => !Number.isNaN(Number(s)) && Number(s) > 0, 'Must be > 0'),
  categoryFilter: z.array(z.string()).optional(),
  accountIds: z.array(z.string()).optional(),
});

const GoalInput = z.discriminatedUnion('type', [SavingsInput, SpendCapInput]);
const SAVINGS_ACCOUNT_TYPES = new Set(['depository', 'investment']);
const SPEND_CAP_ACCOUNT_TYPES = new Set(['depository', 'credit']);

export type GoalFormState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; goalId: string };

/**
 * Pull a goal payload out of FormData. The form encodes:
 *   type: 'savings' | 'spend_cap'
 *   name: string
 *   targetAmount?: string (savings)
 *   monthlyAmount?: string (spend_cap)
 *   targetDate?: string (savings, YYYY-MM-DD)
 *   accountIds: string[] (one entry per checked checkbox)
 *   categoryFilter: string[] (spend_cap, one per checked checkbox)
 */
function parseFormData(fd: FormData) {
  const type = fd.get('type');
  const accountIds = fd.getAll('accountIds').map(String);
  const base = {
    name: String(fd.get('name') ?? ''),
  };

  if (type === 'savings') {
    return GoalInput.safeParse({
      ...base,
      type: 'savings',
      targetAmount: String(fd.get('targetAmount') ?? ''),
      targetDate: String(fd.get('targetDate') ?? ''),
      accountIds,
    });
  }
  if (type === 'spend_cap') {
    return GoalInput.safeParse({
      ...base,
      type: 'spend_cap',
      monthlyAmount: String(fd.get('monthlyAmount') ?? ''),
      categoryFilter: fd.getAll('categoryFilter').map(String),
      accountIds: accountIds.length > 0 ? accountIds : undefined,
    });
  }
  return null;
}

async function validateGoalAccountIds(
  userId: string,
  type: z.infer<typeof GoalInput>['type'],
  accountIds: string[] | undefined,
): Promise<{ accountIds: string[] | null } | { error: string }> {
  const ids = Array.from(new Set(accountIds ?? []));
  if (ids.length === 0) return { accountIds: null };

  const rows = await db
    .select({
      id: financialAccounts.id,
      type: financialAccounts.type,
    })
    .from(financialAccounts)
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        sourceScopeWhere(userId),
        inArray(financialAccounts.id, ids),
      ),
    );

  if (rows.length !== ids.length) {
    return { error: 'One or more selected accounts is no longer available.' };
  }

  const allowed =
    type === 'savings' ? SAVINGS_ACCOUNT_TYPES : SPEND_CAP_ACCOUNT_TYPES;
  if (rows.some((row) => !allowed.has(row.type))) {
    return {
      error:
        type === 'savings'
          ? 'Savings goals can only use cash or investment accounts.'
          : 'Spend caps can only use cash or credit accounts.',
    };
  }

  return { accountIds: ids };
}

export async function createGoal(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const parsed = parseFormData(formData);
  if (!parsed || !parsed.success) {
    const msg = parsed?.error.errors[0]?.message ?? 'Invalid input';
    redirect(`/goals/new?error=${encodeURIComponent(msg)}`);
  }

  const data = parsed.data;
  if (data.type === 'savings') {
    const accountScope = await validateGoalAccountIds(
      session.user.id,
      data.type,
      data.accountIds,
    );
    if ('error' in accountScope) {
      redirect(`/goals/new?error=${encodeURIComponent(accountScope.error)}`);
    }
    if (!accountScope.accountIds) {
      redirect(
        `/goals/new?error=${encodeURIComponent('Pick at least one account')}`,
      );
    }
    await db.insert(goals).values({
      userId: session.user.id,
      name: data.name,
      type: 'savings',
      targetAmount: data.targetAmount,
      accountIds: accountScope.accountIds,
      targetDate: data.targetDate,
    });
  } else {
    const accountScope = await validateGoalAccountIds(
      session.user.id,
      data.type,
      data.accountIds,
    );
    if ('error' in accountScope) {
      redirect(`/goals/new?error=${encodeURIComponent(accountScope.error)}`);
    }
    await db.insert(goals).values({
      userId: session.user.id,
      name: data.name,
      type: 'spend_cap',
      monthlyAmount: data.monthlyAmount,
      accountIds: accountScope.accountIds,
      categoryFilter:
        data.categoryFilter && data.categoryFilter.length > 0
          ? data.categoryFilter
          : null,
    });
  }

  revalidatePath('/goals');
  redirect('/goals');
}

export async function updateGoal(goalId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const [existing] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, session.user.id)));
  if (!existing) throw new Error('Goal not found');

  const parsed = parseFormData(formData);
  if (!parsed || !parsed.success) {
    const msg = parsed?.error.errors[0]?.message ?? 'Invalid input';
    redirect(`/goals/${goalId}/edit?error=${encodeURIComponent(msg)}`);
  }

  const data = parsed.data;
  if (data.type === 'savings') {
    const accountScope = await validateGoalAccountIds(
      session.user.id,
      data.type,
      data.accountIds,
    );
    if ('error' in accountScope) {
      redirect(
        `/goals/${goalId}/edit?error=${encodeURIComponent(accountScope.error)}`,
      );
    }
    if (!accountScope.accountIds) {
      redirect(
        `/goals/${goalId}/edit?error=${encodeURIComponent('Pick at least one account')}`,
      );
    }
    await db
      .update(goals)
      .set({
        name: data.name,
        targetAmount: data.targetAmount,
        accountIds: accountScope.accountIds,
        targetDate: data.targetDate,
        monthlyAmount: null,
        categoryFilter: null,
        updatedAt: new Date(),
      })
      .where(and(eq(goals.id, goalId), eq(goals.userId, session.user.id)));
  } else {
    const accountScope = await validateGoalAccountIds(
      session.user.id,
      data.type,
      data.accountIds,
    );
    if ('error' in accountScope) {
      redirect(
        `/goals/${goalId}/edit?error=${encodeURIComponent(accountScope.error)}`,
      );
    }
    await db
      .update(goals)
      .set({
        name: data.name,
        monthlyAmount: data.monthlyAmount,
        accountIds: accountScope.accountIds,
        categoryFilter:
          data.categoryFilter && data.categoryFilter.length > 0
            ? data.categoryFilter
            : null,
        targetAmount: null,
        targetDate: null,
        updatedAt: new Date(),
      })
      .where(and(eq(goals.id, goalId), eq(goals.userId, session.user.id)));
  }

  revalidatePath('/goals');
  redirect('/goals');
}

export async function deleteGoal(goalId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, session.user.id)));

  revalidatePath('/goals');
}

/**
 * Soft-archive a goal — flips isActive=false. Archived goals stay in the
 * DB so the user can revisit them and the historical data behind them
 * (transactions, accounts) stays attributable. The /goals leaderboard
 * surfaces them in a muted "Archived" section; /goals/[id] still
 * renders with an "· Archived" eyebrow.
 *
 * `restore` (true) is the inverse — flips isActive=true. Same action so
 * the toggle button can drive both directions from one server entry.
 */
export async function setGoalArchived(goalId: string, archived: boolean) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  await db
    .update(goals)
    .set({ isActive: !archived, updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.userId, session.user.id)));

  revalidatePath('/goals');
  // R.3.1 deleted /goals/[id]; archive/restore only invalidates the list.
  // /goals/[id]/edit reads goals fresh on each load, no invalidation needed.
}
