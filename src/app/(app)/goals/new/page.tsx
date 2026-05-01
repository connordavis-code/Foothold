import { auth } from '@/auth';
import { GoalForm } from '@/components/goals/goal-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
    <div className="px-8 py-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>New goal</CardTitle>
          <CardDescription>
            Pick a type, scope it to the right accounts, and we'll track
            progress automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoalForm
            action={createGoal}
            accounts={accounts}
            categories={categories}
            errorMessage={searchParams.error}
            submitLabel="Create goal"
          />
        </CardContent>
      </Card>
    </div>
  );
}
