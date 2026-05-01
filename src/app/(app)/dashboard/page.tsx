import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/auth';

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Phase 1.A — Auth working
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ''}
        </h1>
        <p className="text-muted-foreground">
          Signed in as{' '}
          <span className="font-mono text-sm">{session?.user?.email}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auth + DB are working ✓</CardTitle>
          <CardDescription>
            You're signed in. Magic-link delivery, session persistence, and
            Drizzle's adapter all check out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <p className="font-medium">Coming next — Phase 1.B</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Plaid Link UI to connect a bank or brokerage</li>
              <li>Transaction sync (cursor-based incremental)</li>
              <li>Investment holdings + transaction sync (Fidelity, etc.)</li>
              <li>90-day backfill on first connection</li>
            </ul>
          </div>
          <div className="pt-2">
            <p className="font-medium mb-1">Then Phase 1.C</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Real net-worth dashboard</li>
              <li>Holdings table with P/L + allocation chart</li>
              <li>Auto-categorization with manual overrides</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Net worth</CardDescription>
            <CardTitle className="text-3xl tabular">$—</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Connect an account to populate.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>This month spend</CardDescription>
            <CardTitle className="text-3xl tabular">$—</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              No transactions synced yet.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Investments</CardDescription>
            <CardTitle className="text-3xl tabular">$—</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              No holdings synced yet.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
