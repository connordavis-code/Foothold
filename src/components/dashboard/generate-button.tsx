'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateInsightAction } from '@/lib/insights/actions';
import { Button } from '@/components/ui/button';

type Props = {
  /** When true, label reads "Regenerate" instead of "Generate brief". */
  regenerate?: boolean;
};

/**
 * Generates a weekly brief via the existing Anthropic-backed action. On
 * success routes to /dashboard so the just-generated brief renders in the
 * editorial card. R.2 simplified from the prior 3-mode button (the 'back'
 * mode existed only for the deleted /insights/[week] deep-link).
 */
export function GenerateButton({ regenerate = false }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        await generateInsightAction();
        router.push('/dashboard');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate');
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5"
      >
        <Sparkles className={cn('h-3.5 w-3.5', isPending && 'animate-pulse')} />
        {isPending ? 'Generating…' : regenerate ? 'Regenerate' : 'Generate brief'}
      </Button>
      {error && (
        <p className="max-w-xs text-center text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
