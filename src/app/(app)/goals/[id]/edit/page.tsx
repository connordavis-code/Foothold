import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { GoalForm } from '@/components/goals/goal-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
    <div className="px-8 py-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Edit goal</CardTitle>
          <CardDescription>
            Changes apply to all future progress calculations immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoalForm
            action={action}
            accounts={accounts}
            categories={categories}
            initial={goal}
            errorMessage={searchParams.error}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
