import Link from 'next/link';
import { Mail } from 'lucide-react';

export default function VerifyPage() {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Mail className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We sent a sign-in link to your inbox. Click it to log in.
          <br />
          The link expires in 24 hours.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Didn't receive it?{' '}
        <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
          Try again
        </Link>
      </p>
    </div>
  );
}
