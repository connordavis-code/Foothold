import type {
  ForecastHistory,
  GoalImpact,
  MonthlyProjection,
  ScenarioOverrides,
} from '@/lib/forecast/types';

type Inputs = {
  history: ForecastHistory;
  overrides: ScenarioOverrides;
  baselineProjection: MonthlyProjection[];
  scenarioProjection: MonthlyProjection[];
  goalImpacts: GoalImpact[];
};

// This output format is the AI contract: the sections and field labels here
// are what the LLM prompt sees. Silent format changes alter Anthropic's
// coaching behavior in unpredictable ways — keep tests green before editing
// section headers, labels, or sign conventions.
export function buildForecastPrompt(inputs: Inputs): string {
  const sections: string[] = [];

  sections.push(buildCurrentStateSection(inputs.history));

  const overridesSection = buildOverridesSection(
    inputs.overrides,
    inputs.history,
  );
  if (overridesSection) sections.push(overridesSection);

  sections.push(
    buildProjectionDeltaSection(
      inputs.baselineProjection,
      inputs.scenarioProjection,
    ),
  );

  if (inputs.goalImpacts.length > 0) {
    sections.push(buildGoalImpactsSection(inputs.goalImpacts));
  }

  return sections.join('\n\n');
}

function buildCurrentStateSection(history: ForecastHistory): string {
  const lines: string[] = ['CURRENT STATE'];
  lines.push(`- Cash: ${money(history.currentCash)} across liquid accounts`);
  if (history.goals.length > 0) {
    const goalSummary = history.goals
      .map(
        (g) =>
          `${g.name} (${money(g.targetAmount)} target, ${money(g.currentSaved)} saved)`,
      )
      .join(', ');
    lines.push(`- Active goals: ${goalSummary}`);
  }
  return lines.join('\n');
}

function buildOverridesSection(
  overrides: ScenarioOverrides,
  history: ForecastHistory,
): string | null {
  const lines: string[] = [];

  if (overrides.categoryDeltas?.length) {
    const items = overrides.categoryDeltas.map((d) => {
      const cat = history.categories.find((c) => c.id === d.categoryId);
      const sign = d.monthlyDelta >= 0 ? '+' : '-';
      return `${cat?.name ?? d.categoryId} ${sign}${money(Math.abs(d.monthlyDelta))}/mo`;
    });
    lines.push(`- Category changes: ${items.join(', ')}`);
  }

  if (overrides.lumpSums?.length) {
    const items = overrides.lumpSums.map((l) => {
      const sign = l.amount >= 0 ? '+' : '-';
      return `${l.label} ${l.month} ${sign}${money(Math.abs(l.amount))}`;
    });
    lines.push(`- Lump sums: ${items.join(', ')}`);
  }

  if (overrides.recurringChanges?.length) {
    const items = overrides.recurringChanges.map((c) => {
      if (c.action === 'pause') return `pause ${c.streamId}`;
      if (c.action === 'edit')
        return `edit ${c.streamId} → ${money(c.amount ?? 0)} ${c.cadence ?? ''}`;
      return `add ${c.label ?? 'stream'} ${money(c.amount ?? 0)} ${c.cadence ?? 'monthly'}`;
    });
    lines.push(`- Recurring changes: ${items.join(', ')}`);
  }

  if (overrides.skipRecurringInstances?.length) {
    const items = overrides.skipRecurringInstances.map(
      (s) => `${s.streamId} in ${s.skipMonth}`,
    );
    lines.push(`- Skip recurring: ${items.join(', ')}`);
  }

  if (overrides.incomeDelta) {
    const d = overrides.incomeDelta;
    const sign = d.monthlyDelta >= 0 ? '+' : '-';
    const range =
      d.startMonth || d.endMonth
        ? ` (${d.startMonth ?? 'always'} to ${d.endMonth ?? 'horizon end'})`
        : '';
    lines.push(`- Income: ${sign}${money(Math.abs(d.monthlyDelta))}/mo${range}`);
  }

  if (overrides.hypotheticalGoals?.length) {
    const items = overrides.hypotheticalGoals.map((g) => {
      const dateNote = g.targetDate ? ` by ${g.targetDate}` : '';
      const monthlyNote = g.monthlyContribution
        ? ` @ ${money(g.monthlyContribution)}/mo`
        : '';
      return `${g.name} (${money(g.targetAmount)}${dateNote})${monthlyNote}`;
    });
    lines.push(`- Hypothetical goals: ${items.join(', ')}`);
  }

  if (overrides.goalTargetEdits?.length) {
    const items = overrides.goalTargetEdits.map((e) => {
      const parts: string[] = [];
      if (e.newTargetAmount !== undefined) parts.push(`target → ${money(e.newTargetAmount)}`);
      if (e.newMonthlyContribution !== undefined)
        parts.push(`contribution → ${money(e.newMonthlyContribution)}/mo`);
      return `${e.goalId} (${parts.join(', ')})`;
    });
    lines.push(`- Goal edits: ${items.join(', ')}`);
  }

  if (lines.length === 0) return null;
  return ['SCENARIO OVERRIDES', ...lines].join('\n');
}

function buildProjectionDeltaSection(
  baseline: MonthlyProjection[],
  scenario: MonthlyProjection[],
): string {
  const baselineEnd = baseline[baseline.length - 1]?.endCash ?? 0;
  const scenarioEnd = scenario[scenario.length - 1]?.endCash ?? 0;
  const delta = scenarioEnd - baselineEnd;
  const horizon = scenario.length;

  const minScenarioMonth = scenario.reduce(
    (acc, m) => (m.endCash < acc.endCash ? m : acc),
    scenario[0] ?? { month: '', endCash: 0 },
  );
  const baselineSameMonth = baseline.find((m) => m.month === minScenarioMonth.month);

  const lines: string[] = [`PROJECTION DELTA (${horizon}mo)`];
  lines.push(`- Baseline end: ${money(baselineEnd)}`);
  const sign = delta >= 0 ? '+' : '-';
  lines.push(`- Scenario end: ${money(scenarioEnd)} (${sign}${money(Math.abs(delta))})`);
  if (minScenarioMonth.month) {
    lines.push(
      `- Min cash month: ${minScenarioMonth.month} at ${money(minScenarioMonth.endCash)}` +
        (baselineSameMonth ? ` (baseline: ${money(baselineSameMonth.endCash)})` : ''),
    );
  }
  return lines.join('\n');
}

function buildGoalImpactsSection(impacts: GoalImpact[]): string {
  const lines: string[] = ['GOAL IMPACTS'];
  for (const g of impacts) {
    const isHypo = g.baselineETA === null && g.scenarioETA !== null;
    const name = isHypo ? `${g.name} (hypo)` : g.name;
    if (g.baselineETA && g.scenarioETA) {
      const direction = g.shiftMonths < 0 ? 'sooner' : g.shiftMonths > 0 ? 'later' : 'same';
      const months = Math.abs(g.shiftMonths);
      const shift = g.shiftMonths === 0 ? 'unchanged' : `${months}mo ${direction}`;
      lines.push(`- ${name}: ${g.baselineETA} → ${g.scenarioETA} (${shift})`);
    } else if (g.scenarioETA) {
      lines.push(`- ${name}: ${g.scenarioETA}`);
    } else {
      lines.push(`- ${name}: unreachable within horizon`);
    }
  }
  return lines.join('\n');
}

// Intentionally local — no decimals, different signature from formatCurrency.
// Used only for prompt context where we want whole-dollar amounts.
function money(amount: number): string {
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString('en-US')}`;
}
