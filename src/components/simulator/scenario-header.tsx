'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Scenario } from '@/lib/db/schema';
import type { ScenarioOverrides } from '@/lib/forecast/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  createScenario,
  updateScenario,
  deleteScenario,
} from '@/lib/forecast/scenario-actions';
import { ScenarioPicker } from './scenario-picker';
import { toast } from 'sonner';

type Props = {
  scenarios: Pick<Scenario, 'id' | 'name'>[];
  selectedScenarioId: string | null;
  liveOverrides: ScenarioOverrides;
  isDirty: boolean;
  onSelect: (id: string | null) => void;
  onReset: () => void;
};

export function ScenarioHeader({
  scenarios,
  selectedScenarioId,
  liveOverrides,
  isDirty,
  onSelect,
  onReset,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  const saveCurrent = () => {
    if (!selectedScenarioId) return;
    startTransition(async () => {
      const result = await updateScenario({ id: selectedScenarioId, overrides: liveOverrides });
      if (result.ok) {
        toast.success('Scenario saved');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const saveAs = () => {
    const name = saveAsName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createScenario({ name, overrides: liveOverrides });
      if (result.ok) {
        toast.success(`Saved "${name}"`);
        setSaveAsOpen(false);
        setSaveAsName('');
        onSelect(result.data.id);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const deleteCurrent = () => {
    if (!selectedScenarioId) return;
    startTransition(async () => {
      const result = await deleteScenario({ id: selectedScenarioId });
      if (result.ok) {
        toast.success('Scenario deleted');
        onSelect(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <p className="text-eyebrow">Plan</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Simulator
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isDirty ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">Reset</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your unsaved overrides will be removed. The loaded scenario stays selected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onReset}>Discard</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="ghost" size="sm" onClick={onReset} disabled={!isDirty}>Reset</Button>
        )}

        <ScenarioPicker
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          onSelect={onSelect}
        />

        <AlertDialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" disabled={pending}>Save as…</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save scenario</AlertDialogTitle>
              <AlertDialogDescription>Name this what-if so you can return to it.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-2">
              <input
                className="w-full rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
                placeholder="e.g. Trim recurring"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAs(); }}
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={saveAs} disabled={!saveAsName.trim() || pending}>Save</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {selectedScenarioId && isDirty && (
          <Button variant="default" size="sm" onClick={saveCurrent} disabled={pending}>Save</Button>
        )}

        {selectedScenarioId && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={pending}>Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete scenario?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved scenario but keeps your current overrides in the editor as unsaved work.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteCurrent}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </header>
  );
}
