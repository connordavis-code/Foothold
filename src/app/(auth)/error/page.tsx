import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const errorMessages: Record<string, { title: string; message: string }> = {
  Configuration: {
    title: 'Server misconfiguration',
    message:
      'Something is wrong on our end. Check that AUTH_RESEND_KEY and AUTH_SECRET are set correctly.',
  },
  AccessDenied: {
    title: 'Access denied',
    message: 'You do not have permission to sign in.',
  },
  Verification: {
    title: 'Link expired',
    message:
      'The sign-in link has expired or has already been used. Request a new one.',
  },
  Default: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred during sign-in. Please try again.',
  },
};

export default function ErrorPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const errorKey = searchParams.error ?? 'Default';
  const { title, message } = errorMessages[errorKey] ?? errorMessages.Default;

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>
      <Button asChild className="w-full">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}
