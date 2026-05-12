'use client';

import type { Scenario } from '@/lib/db/schema';
import type { ScenarioOverrides } from '@/lib/forecast/types';
import { cn, formatCurrency } from '@/lib/utils';
import {
  pickActiveCard as _pickActiveCard,
  formatDelta,
  describeOverrides,
} from './scenario-cards-logic';

export type { ActiveCardId } from './scenario-cards-logic';
export { pickActiveCard } from './scenario-cards-logic';

type Props = {
  scenarios: Pick<Scenario, 'id' | 'name'>[];
  selectedScenarioId: string | null;
  liveOverrides: ScenarioOverrides;
  baselineEndCash: number;
  scenarioEndCash: number;
  baselineLabel: string;
  scenarioLabel: string | null;
  onSelect: (id: string | null) => void;
};

export function ScenarioCards({
  scenarios,
  selectedScenarioId,
  liveOverrides,
  baselineEndCash,
  scenarioEndCash,
  baselineLabel,
  scenarioLabel,
  onSelect,
}: Props) {
  const activeId = _pickActiveCard(scenarios, selectedScenarioId, liveOverrides);
  const delta = scenarioEndCash - baselineEndCash;

  return (
    <div className="flex flex-wrap gap-4 md:flex-nowrap md:overflow-x-auto md:gap-6">
      <Card
        active={activeId === 'baseline'}
        accent="baseline"
        name="Baseline"
        deltaLabel={null}
        figure={baselineEndCash}
        meta={baselineLabel}
        onClick={() => onSelect(null)}
      />

      <Card
        active={activeId !== 'baseline'}
        accent="scenario"
        name={scenarioLabel ?? 'Current scenario'}
        deltaLabel={formatDelta(delta, formatCurrency)}
        figure={scenarioEndCash}
        meta={describeOverrides(liveOverrides)}
        onClick={() => {/* current scenario already active */}}
      />

      {scenarios
        .filter((s) => s.id !== selectedScenarioId)
        .map((s) => (
          <Card
            key={s.id}
            active={false}
            accent="saved"
            name={s.name}
            deltaLabel={null}
            figure={null}
            meta="Saved scenario"
            onClick={() => onSelect(s.id)}
          />
        ))}
    </div>
  );
}

type CardProps = {
  active: boolean;
  accent: 'baseline' | 'scenario' | 'saved';
  name: string;
  deltaLabel: string | null;
  figure: number | null;
  meta: string;
  onClick: () => void;
};

function Card({ active, accent, name, deltaLabel, figure, meta, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative min-w-[260px] flex-1 rounded-card border border-hairline-strong bg-surface-elevated p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        active && 'border-text-3',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
          style={{
            background:
              accent === 'baseline'
                ? 'var(--text-2)'
                : 'hsl(var(--accent))',
          }}
        />
      )}
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <span
            aria-hidden
            className={cn(
              'h-2 w-2 rounded-full',
              accent === 'baseline' ? 'bg-text-3' : '',
            )}
            style={{
              background:
                accent === 'baseline' ? 'var(--text-2)' : 'hsl(var(--accent))',
            }}
          />
          {name}
        </span>
        {deltaLabel && (
          <span
            className="font-mono tabular-nums text-xs"
            style={{
              color: deltaLabel.startsWith('+')
                ? 'hsl(var(--accent))'
                : 'var(--semantic-caution)',
            }}
          >
            {deltaLabel}
          </span>
        )}
      </div>
      {figure !== null && (
        <div className="font-mono text-2xl tabular-nums text-foreground" style={{ letterSpacing: '-0.02em' }}>
          {formatCurrency(figure)}
        </div>
      )}
      <div className="mt-2 text-xs text-text-3">{meta}</div>
    </button>
  );
}
