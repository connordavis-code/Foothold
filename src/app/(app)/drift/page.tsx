import { TrendingUp } from 'lucide-react';
import { auth } from '@/auth';
import { TrendChart } from '@/components/drift/trend-chart';
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
  MIN_BASELINE,
  MIN_CURRENT,
  MIN_RATIO,
  getDriftAnalysis,
} from '@/lib/db/queries/drift';
import { formatCurrency } from '@/lib/utils';

function humanizeCategory(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function formatRatio(r: number): string {
  return `${r.toFixed(1)}×`;
}

export default async function DriftPage() {
  const session = await auth();
  if (!session?.user) return null;

  const drift = await getDriftAnalysis(session.user.id);

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Drift</h1>
        <p className="text-sm text-muted-foreground">
          Categories spending materially above their {drift.weeks}-week
          baseline. Flagged when current week is at least{' '}
          {MIN_RATIO}× the prior 4-week median, with a baseline of at
          least {formatCurrency(MIN_BASELINE)} and current of at least{' '}
          {formatCurrency(MIN_CURRENT)}.
        </p>
      </div>

      {drift.baselineSparse ? (
        <Card>
          <CardHeader>
            <CardTitle>Not enough history yet</CardTitle>
            <CardDescription>
              Drift detection needs at least 4 weeks of transaction data
              to establish a baseline. Once Plaid has synced enough
              history, categories with elevated spending will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {drift.currentlyElevated.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>This week</CardTitle>
                <CardDescription>
                  {drift.currentlyElevated.length === 1
                    ? '1 category is elevated.'
                    : `${drift.currentlyElevated.length} categories are elevated.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {drift.currentlyElevated.map((flag) => (
                    <ElevatedCard key={flag.category} flag={flag} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Nothing elevated this week</CardTitle>
                <CardDescription>
                  Every category is within {MIN_RATIO}× of its 4-week
                  median.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Weekly spending by category</CardTitle>
              <CardDescription>
                Top categories over the last {drift.weeks} weeks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart histories={drift.topCategories} />
            </CardContent>
          </Card>

          {drift.flagHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Flag history</CardTitle>
                <CardDescription>
                  Every week in the visible window where a category
                  tripped the threshold.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week ending</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Spent</TableHead>
                      <TableHead className="text-right">Baseline</TableHead>
                      <TableHead className="text-right">Ratio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drift.flagHistory.map((flag) => (
                      <TableRow key={`${flag.weekEnd}-${flag.category}`}>
                        <TableCell className="text-muted-foreground">
                          {flag.weekEnd}
                        </TableCell>
                        <TableCell className="font-medium">
                          {humanizeCategory(flag.category)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(flag.currentTotal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(flag.baselineWeekly)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatRatio(flag.ratio)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ElevatedCard({
  flag,
}: {
  flag: {
    category: string;
    currentTotal: number;
    baselineWeekly: number;
    ratio: number;
  };
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {humanizeCategory(flag.category)}
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          <TrendingUp className="h-3 w-3" />
          {formatRatio(flag.ratio)}
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatCurrency(flag.currentTotal)}
      </p>
      <p className="text-xs text-muted-foreground">
        vs {formatCurrency(flag.baselineWeekly)} typical
      </p>
    </div>
  );
}
