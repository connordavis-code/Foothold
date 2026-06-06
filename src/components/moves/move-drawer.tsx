'use client';

import { useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { MoveEditor, type MoveEditorContext } from './move-editor';
import type { MoveTemplateKey } from '@/lib/moves/validation';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

export type { MoveEditorContext } from './move-editor';

export type MoveDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Add a Move to Emergency fund" or "Add a Move to this scenario" */
  title: string;
  context: MoveEditorContext;
  streams: RecurringStreamRow[];
  categories: { key: string; label: string }[];
  /** Pre-fills a specific template + params (e.g. from a SuggestionChip). */
  prefill?: { templateKey: MoveTemplateKey; params: Record<string, unknown> };
  /** Forwarded into the attach call as `source`. Goal context only. */
  source?: 'manual' | 'drift' | 'hike';
  /**
   * When present, the drawer wraps MoveEditor in UPDATE mode — submit calls
   * updateGoalMoveAction instead of attachGoalMoveAction. Goal context only.
   */
  editingMoveId?: string;
  /** Called with the new moveId after a successful attach. */
  onAttached?: (moveId: string) => void;
};

/**
 * Vaul-based drawer wrapping <MoveEditor>.
 * Bottom sheet on mobile (<md), right-side panel on tablet+ (≥md).
 * Context-parameterized title passed from parent (e.g. "Add a Move to Emergency fund").
 */
export function MoveDrawer({
  open,
  onOpenChange,
  title,
  context,
  streams,
  categories,
  prefill,
  source = 'manual',
  editingMoveId,
  onAttached,
}: MoveDrawerProps) {
  // Read breakpoint at mount and listen for changes.
  // SSR-safe: initialized to false, hydrates on client-mount.
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={isDesktop ? 'right' : 'bottom'}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Drawer.Content className="fixed bottom-0 right-0 top-0 z-50 flex h-full w-full flex-col bg-surface-elevated p-6 md:bottom-auto md:w-[420px]">
          <Drawer.Title className="mb-1 text-base font-medium text-foreground">
            {title}
          </Drawer.Title>
          <MoveEditor
            context={context}
            streams={streams}
            categories={categories}
            prefill={prefill}
            source={source}
            editingMoveId={editingMoveId}
            onAttached={onAttached}
            onCancel={() => onOpenChange(false)}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
