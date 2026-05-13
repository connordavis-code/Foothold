'use client';

import { MOVE_TEMPLATES, type MoveTemplateId } from '@/lib/simulator/moves/templates';
import { cn } from '@/lib/utils';

type Props = {
  onPick: (templateId: MoveTemplateId) => void;
  disabledTemplates?: ReadonlySet<MoveTemplateId>;
};

export function MovesGrid({ onPick, disabledTemplates }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {MOVE_TEMPLATES.map((t) => {
        const Icon = t.icon;
        const disabled = disabledTemplates?.has(t.id) ?? false;
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(t.id)}
            className={cn(
              'group flex items-center gap-3 rounded-2xl border border-[--hairline] bg-[--surface] p-4 text-left transition-colors duration-fast ease-out-quart',
              disabled
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-text-3',
            )}
            title={disabled ? 'Connect accounts first — needs at least one recurring charge.' : undefined}
          >
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-card border border-hairline bg-surface-sunken text-text-2"
            >
              <Icon size={18} />
            </span>
            <span>
              <span className="block text-sm text-foreground">{t.title}</span>
              <span className="block text-xs text-text-3">{t.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
