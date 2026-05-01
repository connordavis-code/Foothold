import Link from 'next/link';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type AccountWithHoldings,
  getHoldingsByAccount,
} from '@/lib/db/queries/investments';
import { formatCurrency, formatPercent } from '@/lib/utils';

export default async function InvestmentsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const accounts = await getHoldingsByAccount(session.user.id);

  if (accounts.length === 0) {
    return (
      <div className="px-8 py-8 max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight mb-6">
          Investments
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>No investment accounts</CardTitle>
            <CardDescription>
              Connect a brokerage, IRA, 401(k), or other investment account
              via Plaid to see holdings here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/settings">Go to Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const grandTotal = accounts.reduce((sum, a) => sum + a.totalValue, 0);
  const grandCost = accounts.reduce((sum, a) => sum + a.totalCost, 0);
  const grandGainLoss = accounts.reduce((sum, a) => sum + a.totalGainLoss, 0);
  const anyCosted = accounts.some((a) => a.costedHoldingsCount > 0);

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Investments</h1>
        <p className="text-sm text-muted-foreground">
          Holdings across your connected investment accounts.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Total value</CardDescription>
            <CardTitle className="text-3xl tabular">
              {formatCurrency(grandTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Across {accounts.length}{' '}
              {accounts.length === 1 ? 'account' : 'accounts'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Cost basis</CardDescription>
            <CardTitle className="text-3xl tabular">
              {anyCosted ? formatCurrency(grandCost) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {anyCosted
                ? 'Sum of cost across positions Plaid reports a basis for'
                : 'No cost-basis data from Plaid yet'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Unrealized gain / loss</CardDescription>
            <CardTitle
              className={`text-3xl tabular ${
                anyCosted
                  ? grandGainLoss >= 0
                    ? 'text-positive'
                    : 'text-destructive'
                  : ''
              }`}
            >
              {anyCosted
                ? formatCurrency(grandGainLoss, { signed: true })
                : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {anyCosted && grandCost !== 0
                ? `${formatPercent(grandGainLoss / grandCost)} on cost`
                : 'Calculated only when cost basis is known'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {accounts.map((acc) => (
          <AccountHoldings key={acc.id} account={acc} />
        ))}
      </div>
    </div>
  );
}

function AccountHoldings({ account }: { account: AccountWithHoldings }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>
            {account.name}
            {account.mask && (
              <span className="ml-2 text-sm text-muted-foreground font-normal">
                ····{account.mask}
              </span>
            )}
          </CardTitle>
          <CardDescription className="capitalize">
            {account.subtype ?? 'investment'}
          </CardDescription>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">
            {formatCurrency(account.totalValue)}
          </p>
          {account.costedHoldingsCount > 0 && (
            <p
              className={`text-xs tabular-nums ${
                account.totalGainLoss >= 0
                  ? 'text-positive'
                  : 'text-destructive'
              }`}
            >
              {formatCurrency(account.totalGainLoss, { signed: true })}
              {account.totalCost !== 0 &&
                ` (${formatPercent(account.totalGainLoss / account.totalCost)})`}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {account.holdings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No holdings reported for this account.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Cost basis</TableHead>
                <TableHead className="text-right">Gain / loss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {account.holdings.map((h) => {
                const gl =
                  h.costBasis != null && h.institutionValue != null
                    ? h.institutionValue - h.costBasis
                    : null;
                const glPct =
                  gl != null && h.costBasis ? gl / h.costBasis : null;
                return (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs">
                      {h.ticker ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-0">
                      <p className="truncate">{h.securityName ?? '—'}</p>
                      {h.securityType && (
                        <p className="text-xs text-muted-foreground capitalize">
                          {h.securityType.replace(/_/g, ' ')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {h.quantity.toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {h.institutionPrice != null
                        ? formatCurrency(h.institutionPrice)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {h.institutionValue != null
                        ? formatCurrency(h.institutionValue)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {h.costBasis != null ? formatCurrency(h.costBasis) : '—'}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        gl == null
                          ? 'text-muted-foreground'
                          : gl >= 0
                            ? 'text-positive'
                            : 'text-destructive'
                      }`}
                    >
                      {gl == null ? (
                        '—'
                      ) : (
                        <>
                          {formatCurrency(gl, { signed: true })}
                          {glPct != null && (
                            <div className="text-xs">
                              {formatPercent(glPct)}
                            </div>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
