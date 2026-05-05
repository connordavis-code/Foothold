'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { generateInsightAction } from '@/lib/insights/actions';
import { Button } from '@/components/ui/button';
import type { ButtonMode } from '@/lib/insights/button-mode';

type Props = {
  mode: ButtonMode;
};

export function GenerateButton({ mode }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (mode === 'back') {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/insights" className="inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to current week
        </Link>
      </Button>
    );
  }

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        await generateInsightAction();
        // Strip any ?week= so the user lands on the just-generated narrative.
        router.push('/insights');
        router.refresh();
      } catch (err) {
        // generateInsightForUser throws caller-friendly Error messages
        // (see src/lib/insights/generate.ts).
        setError(err instanceof Error ? err.message : 'Failed to generate');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isPending
          ? 'Generating…'
          : mode === 'regenerate'
          ? 'Regenerate'
          : 'Generate insights'}
      </Button>
      {error && (
        <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
