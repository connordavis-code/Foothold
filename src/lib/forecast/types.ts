/**
 * What the user can override when constructing a what-if scenario.
 * Persisted as jsonb in the `scenario.overrides` column.
 * Validated at server-action boundaries via zod (see scenario-zod.ts).
 */
export type ScenarioOverrides = {
  /** Per-category monthly $ change. Negative = cut, positive = increase. */
  categoryDeltas?: Array<{
    categoryId: string;
    monthlyDelta: number;
    startMonth?: string; // YYYY-MM, default = next month after currentMonth
    endMonth?: string;   // YYYY-MM, default = horizon end
  }>;

  /** One-time cash events. */
  lumpSums?: Array<{
    id: string;     // client-generated stable id (React keys)
    label: string;
    amount: number; // positive = inflow, negative = outflow
    month: string;  // YYYY-MM
  }>;

  /** Recurring stream changes — pause/edit existing or add hypothetical. */
  recurringChanges?: Array<{
    streamId?: string; // existing stream id; null/undefined when action='add'
    action: 'pause' | 'edit' | 'add';
    label?: string;
    amount?: number;
    direction?: 'inflow' | 'outflow';
    cadence?: 'weekly' | 'biweekly' | 'monthly';
    startMonth?: string;
    endMonth?: string;
  }>;

  /** Income delta (separated from categoryDeltas because income isn't categorized). */
  incomeDelta?: { monthlyDelta: number; startMonth?: string; endMonth?: string };

  /** Hypothetical goals — don't exist in DB, live only inside the scenario. */
  hypotheticalGoals?: Array<{
    id: string;     // client-generated
    name: string;
    targetAmount: number;
    targetDate?: string; // YYYY-MM-DD
    monthlyContribution?: number;
  }>;

  /** Edits to existing real goals — DO NOT mutate the goal table; only override in projection. */
  goalTargetEdits?: Array<{
    goalId: string;
    newTargetAmount?: number;
    newTargetDate?: string;
    newMonthlyContribution?: number;
  }>;

  /** Skip specific upcoming recurring instances. */
  skipRecurringInstances?: Array<{
    streamId: string;
    skipMonth: string; // YYYY-MM
  }>;
};

/**
 * Read-only snapshot of the user's current state, prepared by
 * `src/lib/db/queries/forecast.ts` and passed into `projectCash`.
 */
export type ForecastHistory = {
  /** Sum of current liquid account balances (checking + savings). */
  currentCash: number;

  /** Active recurring streams with implied future occurrences. */
  recurringStreams: Array<{
    id: string;
    label: string;
    amount: number;            // always positive
    direction: 'inflow' | 'outflow';
    cadence: 'weekly' | 'biweekly' | 'monthly';
    nextDate: string;          // YYYY-MM-DD; first future occurrence
  }>;

  /** Per-category trailing monthly outflow totals (RAW PFC sums — recurring
   *  transactions are NOT subtracted out; the engine consumes these directly).
   *  Last N months only (e.g. 3). */
  categoryHistory: Record<string, number[]>; // categoryId → [t-3, t-2, t-1]

  /** Trailing total income per month (raw — includes recurring inflows like
   *  salary). Last N months. */
  incomeHistory: number[];

  /** Existing real goals. */
  goals: Array<{
    id: string;
    name: string;
    targetAmount: number;
    targetDate: string | null;       // YYYY-MM-DD
    monthlyContribution: number | null;
    currentSaved: number;
  }>;

  /** Category metadata (id → display name) for output composition. */
  categories: Array<{ id: string; name: string }>;
};

/**
 * One row of the engine output. Each row covers one calendar month.
 */
export type MonthlyProjection = {
  month: string;       // YYYY-MM
  startCash: number;   // beginning-of-month
  inflows: number;
  outflows: number;
  endCash: number;     // end-of-month — primary chart series
  byCategory: Record<string, number>;       // outflow per category id
  goalProgress: Record<string, number>;     // dollars accumulated per goal id (real + "hypo:<id>")
};

/**
 * Per-goal summary of how this scenario shifts the ETA vs baseline.
 */
export type GoalImpact = {
  goalId: string;             // real goal id OR "hypo:<uuid>"
  name: string;
  baselineETA: string | null; // YYYY-MM, or null if "never within horizon"
  scenarioETA: string | null;
  shiftMonths: number;        // negative = sooner, positive = later, 0 = same
};

/**
 * Engine input — bundled so the function signature is stable as inputs evolve.
 */
export type ProjectCashInput = {
  history: ForecastHistory;
  overrides: ScenarioOverrides;
  /** Current month YYYY-MM. Passed in so the function stays pure (no Date.now). */
  currentMonth: string;
};

/**
 * Engine output — projection rows + per-goal impact summary.
 */
export type ProjectionResult = {
  projection: MonthlyProjection[];
  goalImpacts: GoalImpact[];
};
