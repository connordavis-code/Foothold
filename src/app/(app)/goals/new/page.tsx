import { auth } from '@/auth';
import { GoalForm } from '@/components/goals/goal-form';
import {
  getDistinctCategories,
  getUserAccounts,
} from '@/lib/db/queries/transactions';
import { createGoal } from '@/lib/goals/actions';

export default async function NewGoalPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const [accounts, categories] = await Promise.all([
    getUserAccounts(session.user.id),
    getDistinctCategories(session.user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <header>
        <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Plan
        </div>
        <h1
          className="mt-1 font-display italic text-3xl text-foreground md:text-4xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          New goal
        </h1>
        <p className="mt-1 text-sm text-[--text-2]">
          Pick a type, scope it to the right accounts, and we'll track
          progress automatically.
        </p>
      </header>
      <GoalForm
        action={createGoal}
        accounts={accounts}
        categories={categories}
        errorMessage={searchParams.error}
        submitLabel="Create goal"
      />
    </div>
  );
}
