'use client';

import { Drawer } from 'vaul';
import type { ScenarioOverrides, ForecastHistory } from '@/lib/forecast/types';
import { findTemplate, type MoveTemplateId } from '@/lib/simulator/moves/templates';
import { MoveTemplateForm } from './move-template-form';

type Props = {
  activeTemplateId: MoveTemplateId | null;
  history: ForecastHistory;
  liveOverrides: ScenarioOverrides;
  currentMonth: string;
  availableMonths: string[];
  onSubmit: (templateId: MoveTemplateId, values: Record<string, unknown>) => void;
  onClose: () => void;
};

export function MoveTemplateDrawer({
  activeTemplateId,
  history,
  liveOverrides,
  currentMonth,
  availableMonths,
  onSubmit,
  onClose,
}: Props) {
  const template = activeTemplateId ? findTemplate(activeTemplateId) : null;
  const open = Boolean(template);

  if (!template) return null;

  const conflictMessage = template.conflictsWith?.(liveOverrides) ?? null;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      direction="right"
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Drawer.Content className="fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-surface-elevated p-6 md:w-[420px]">
          <Drawer.Title className="mb-1 text-base font-medium text-foreground">
            {template.title}
          </Drawer.Title>
          <p className="mb-4 text-xs text-text-3">{template.description}</p>
          <MoveTemplateForm
            template={template}
            currentMonth={currentMonth}
            availableMonths={availableMonths}
            recurringStreams={history.recurringStreams.map((s) => ({
              id: s.id,
              label: s.label,
              direction: s.direction,
            }))}
            conflictMessage={conflictMessage}
            onSubmit={(values) => onSubmit(template.id, values)}
            onCancel={onClose}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
