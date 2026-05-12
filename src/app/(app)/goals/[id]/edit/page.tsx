import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { GoalForm } from '@/components/goals/goal-form';
import { getGoalById } from '@/lib/db/queries/goals';
import {
  getDistinctCategories,
  getUserAccounts,
} from '@/lib/db/queries/transactions';
import { updateGoal } from '@/lib/goals/actions';

export default async function EditGoalPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const [goal, accounts, categories] = await Promise.all([
    getGoalById(session.user.id, params.id),
    getUserAccounts(session.user.id),
    getDistinctCategories(session.user.id),
  ]);

  if (!goal) notFound();

  // Pre-bind goalId so the form's action signature matches `(formData) => void`.
  const action = updateGoal.bind(null, goal.id);

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
          Edit goal
        </h1>
        <p className="mt-1 text-sm text-[--text-2]">
          Changes apply to all future progress calculations immediately.
        </p>
      </header>
      <GoalForm
        action={action}
        accounts={accounts}
        categories={categories}
        initial={goal}
        errorMessage={searchParams.error}
        submitLabel="Save changes"
      />
    </div>
  );
}
