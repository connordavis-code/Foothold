'use client';

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { generateInsightAction } from '@/lib/insights/actions';

type Status =
  | { kind: 'idle' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export function GenerateButton({ hasExisting }: { hasExisting: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function onClick() {
    setStatus({ kind: 'idle' });
    startTransition(async () => {
      try {
        await generateInsightAction();
        setStatus({ kind: 'success' });
        router.refresh();
      } catch (e) {
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Failed to generate',
        });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onClick} disabled={isPending}>
        <Sparkles
          className={`h-4 w-4 ${isPending ? 'animate-pulse' : ''}`}
        />
        {isPending
          ? 'Generating…'
          : hasExisting
            ? 'Regenerate'
            : 'Generate insights'}
      </Button>
      {status.kind === 'error' && (
        <p className="text-xs text-destructive">{status.message}</p>
      )}
    </div>
  );
}
