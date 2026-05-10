// src/app/(app)/goals/[id]/not-found.tsx
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function GoalNotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Goal not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This goal doesn&apos;t exist or isn&apos;t visible to your account.
      </p>
      <Button asChild className="mt-6">
        <Link href="/goals">
          <ArrowLeft className="h-4 w-4" />
          Back to goals
        </Link>
      </Button>
    </div>
  );
}
