import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { ConnectBankButton } from '@/components/plaid/connect-bank-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { db } from '@/lib/db';
import { plaidItems } from '@/lib/db/schema';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const items = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.userId, session.user.id))
    .orderBy(plaidItems.createdAt);

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your sign-in identity.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-mono">{session.user.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="font-mono text-xs">{session.user.id}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Connected institutions</CardTitle>
            <CardDescription>
              Banks and brokerages connected via Plaid. Sandbox mode uses
              fake test data — pick "First Platypus Bank" and log in with
              <span className="font-mono"> user_good / pass_good</span>.
            </CardDescription>
          </div>
          <ConnectBankButton />
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No institutions connected yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {item.institutionName ?? 'Unknown institution'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connected {item.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
