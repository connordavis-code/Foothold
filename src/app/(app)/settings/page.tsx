import { inArray } from 'drizzle-orm';
import { auth } from '@/auth';
import { ConnectAccountButton } from '@/components/connect/connect-account-button';
import { SourceHealthRow } from '@/components/sync/source-health-row';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { db } from '@/lib/db';
import { getSourceHealth } from '@/lib/db/queries/health';
import { financialAccounts } from '@/lib/db/schema';
import { snaptradeConfigured } from '@/lib/snaptrade/client';
import { formatCurrency } from '@/lib/utils';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const sources = await getSourceHealth(session.user.id);

  const accounts = sources.length
    ? await db
        .select()
        .from(financialAccounts)
        .where(
          inArray(
            financialAccounts.itemId,
            sources.map((s) => s.itemId),
          ),
        )
    : [];

  const accountsByItem = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const list = accountsByItem.get(a.itemId) ?? [];
    list.push(a);
    accountsByItem.set(a.itemId, list);
  }

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
              Banks and credit cards via Plaid; brokerages via SnapTrade
              when SnapTrade keys are configured.
            </CardDescription>
          </div>
          <ConnectAccountButton snaptradeEnabled={snaptradeConfigured()} />
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No institutions connected yet.
            </p>
          ) : (
            <ul className="space-y-6">
              {sources.map((source) => {
                const itemAccounts = accountsByItem.get(source.itemId) ?? [];
                return (
                  <li key={source.itemId} className="space-y-3">
                    <SourceHealthRow source={source} />
                    {itemAccounts.length > 0 && (
                      <ul className="rounded-md border border-border divide-y divide-border text-sm">
                        {itemAccounts.map((a) => (
                          <li
                            key={a.id}
                            className="px-3 py-2 flex items-center justify-between"
                          >
                            <div>
                              <p>
                                {a.name}
                                {a.mask && (
                                  <span className="text-muted-foreground">
                                    {' '}
                                    ····{a.mask}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {a.subtype ?? a.type}
                              </p>
                            </div>
                            <p className="tabular text-sm">
                              {a.currentBalance != null
                                ? formatCurrency(Number(a.currentBalance))
                                : '—'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
