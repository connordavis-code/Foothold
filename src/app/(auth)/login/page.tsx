import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signInWithEmail } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  const showInvalidEmail = searchParams.error === 'invalid_email';

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <Link
          href="/"
          className="inline-block text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Personal Finance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to your account
        </h1>
        <p className="text-sm text-muted-foreground">
          We'll email you a link to sign in. No password required.
        </p>
      </div>

      <form action={signInWithEmail} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            aria-invalid={showInvalidEmail || undefined}
          />
          {showInvalidEmail && (
            <p className="text-sm text-destructive">
              Please enter a valid email address.
            </p>
          )}
        </div>
        <Button type="submit" className="w-full">
          Send magic link
        </Button>
      </form>

      <p className="text-xs text-center text-muted-foreground leading-relaxed">
        First time? We'll create your account automatically when you click the
        link.
      </p>
    </div>
  );
}
