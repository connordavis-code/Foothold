import { ConnectAccountButton } from '@/components/connect/connect-account-button';
import { SourceHealthRow } from '@/components/sync/source-health-row';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { SourceHealth } from '@/lib/db/queries/health';
import { formatCurrency } from '@/lib/utils';

interface FinancialAccountRow {
  id: string;
  itemId: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  currentBalance: string | null;
}

interface Props {
  sources: ReadonlyArray<SourceHealth>;
  accountsByItem: ReadonlyMap<string, ReadonlyArray<FinancialAccountRow>>;
  snaptradeEnabled: boolean;
}

export function ConnectedAccountsSection({ sources, accountsByItem, snaptradeEnabled }: Props) {
  return (
    <Card className="bg-surface-elevated border-hairline-strong shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Connected institutions</CardTitle>
          <CardDescription>
            Banks and credit cards via Plaid; brokerages via SnapTrade when SnapTrade keys are configured.
          </CardDescription>
        </div>
        <ConnectAccountButton snaptradeEnabled={snaptradeEnabled} />
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No institutions connected yet.</p>
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
                                <span className="text-muted-foreground"> ····{a.mask}</span>
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
  );
}
