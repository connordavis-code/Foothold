import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/auth';
import { ConnectAccountButton } from '@/components/connect/connect-account-button';
import { DisconnectItemButton } from '@/components/plaid/disconnect-item-button';
import { ReconnectButton } from '@/components/plaid/reconnect-button';
import { statusLabel } from '@/components/plaid/status';
import { SyncButton } from '@/components/plaid/sync-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { db } from '@/lib/db';
import { financialAccounts, externalItems } from '@/lib/db/schema';
import { snaptradeConfigured } from '@/lib/snaptrade/client';
import { formatCurrency } from '@/lib/utils';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const items = await db
    .select()
    .from(externalItems)
    .where(eq(externalItems.userId, session.user.id))
    .orderBy(externalItems.createdAt);

  const accounts = items.length
    ? await db
        .select()
        .from(financialAccounts)
        .where(
          inArray(
            financialAccounts.itemId,
            items.map((i) => i.id),
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
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No institutions connected yet.
            </p>
          ) : (
            <ul className="space-y-6">
              {items.map((item) => {
                const itemAccounts = accountsByItem.get(item.id) ?? [];
                return (
                  <li key={item.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          {item.institutionName ?? 'Unknown institution'}
                          {item.status !== 'active' && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                              {statusLabel(item.status)}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Connected {item.createdAt.toLocaleDateString()} ·{' '}
                          {item.lastSyncedAt
                            ? `synced ${formatRelative(item.lastSyncedAt)}`
                            : 'never synced'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {item.status === 'active' ? (
                          <SyncButton itemId={item.id} />
                        ) : (
                          <ReconnectButton itemId={item.id} />
                        )}
                        <DisconnectItemButton
                          itemId={item.id}
                          institutionName={
                            item.institutionName ?? 'this institution'
                          }
                        />
                      </div>
                    </div>
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

/** "5 minutes ago" / "2 hours ago" / "yesterday" / locale date for older. */
function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}
