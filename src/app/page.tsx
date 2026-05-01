import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';

/**
 * Public landing page. Signed-in users skip past it to /dashboard. The
 * redirect happens here (not in middleware) so it uses the real
 * database-validated session — a stale cookie won't trigger a loop.
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-2xl w-full">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-widest text-muted-foreground">
              Personal Finance
            </p>
            <h1 className="text-5xl font-semibold tracking-tight">
              Track every dollar.<br />
              <span className="text-muted-foreground">Hit every goal.</span>
            </h1>
          </div>

          <p className="text-lg text-muted-foreground leading-relaxed">
            Income, expenses, subscriptions, and brokerage holdings — all in
            one place. Connected through Plaid, organized around your goals,
            and coached toward better decisions.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            <FeatureCard label="Phase 1" title="Tracking" />
            <FeatureCard label="Phase 2" title="Goals" />
            <FeatureCard label="Phase 3" title="Coaching" />
            <FeatureCard label="Phase 4" title="Forecasts" />
          </div>

          <div className="pt-4">
            <Button asChild size="lg">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ label, title }: { label: string; title: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-medium mt-1">{title}</p>
    </div>
  );
}
