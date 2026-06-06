import { z } from 'zod';

/**
 * Zod boundary contracts for the R.4 Move primitive.
 *
 * See docs/redesign/r4-moves-scenarios/SPEC.md § Architecture > Data model.
 *
 * Two discriminated-union schemas:
 *
 *   goalMoveInputSchema      — what server actions accept for /goals.
 *                              Rejects `skip-once` at the discriminator because
 *                              committing to a single-instance skip is
 *                              semantically incoherent. (SPEC Decision #3)
 *
 *   scenarioMoveInputSchema  — what server actions accept for /simulator.
 *                              Permits all four templates including `skip-once`.
 *
 * Per-template `params` shapes mirror the engine's `Move` discriminated union
 * (defined in src/lib/moves/appliers.ts). The DB stores `template_key` + `params`
 * separately; the engine reconstructs the flat `Move` shape at read time.
 *
 * Field conventions reused from src/lib/forecast/scenario-zod.ts:
 *   - monthString: YYYY-MM (engine is month-discrete)
 *   - z.string().uuid() for FK references that resolve to crypto.randomUUID()-
 *     generated text columns. Codebase-wide convention; see schema.ts.
 */

const monthString = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');

// `source` tracks where a goal_move attach originated — for future analytics.
// Server actions default to 'manual' when omitted (SuggestionChip attach paths
// set 'drift' or 'hike' explicitly).
export const goalMoveSourceSchema = z.enum(['manual', 'drift', 'hike']);
export type GoalMoveSource = z.infer<typeof goalMoveSourceSchema>;

// =============================================================================
// Per-template params
// =============================================================================

// adjust-recurring: change a recurring stream's amount over a window.
// newAmount=0 means cancel for the duration (collapses R.3.5's separate
// "Cancel subs" template into the same applier).
const adjustRecurringParamsSchema = z.object({
  streamId: z.string().uuid(),
  startMonth: monthString,
  endMonth: monthString.optional(),
  newAmount: z.number().nonnegative(),
});

// reduce-category: trim spending in a category by a fixed monthly amount.
// `deltaAmount` is the reduction magnitude (always positive); applier flips
// the sign when composing the projection delta.
const reduceCategoryParamsSchema = z.object({
  categoryKey: z.string().min(1),
  startMonth: monthString,
  endMonth: monthString.optional(),
  deltaAmount: z.number().positive(),
});

// income-event: signed monthly income delta over a window.
// Positive = raise/bonus. Negative = job loss / pay cut. Zero rejected
// because a no-op move is incoherent commitment.
const incomeEventParamsSchema = z.object({
  startMonth: monthString,
  endMonth: monthString.optional(),
  monthlyAmount: z.number().refine((n) => n !== 0, {
    message: 'monthlyAmount must be non-zero',
  }),
});

// skip-once: simulator-only. Skips a single recurring instance in a given month.
const skipOnceParamsSchema = z.object({
  streamId: z.string().uuid(),
  month: monthString,
});

// =============================================================================
// Discriminated union per surface
// =============================================================================

// /goals — three templates only. skip-once REJECTED at the discriminator per
// SPEC Decision #3. Server action calls .parse(); a malformed request can't
// reach the DB write.
export const goalMoveInputSchema = z.discriminatedUnion('templateKey', [
  z.object({
    templateKey: z.literal('adjust-recurring'),
    params: adjustRecurringParamsSchema,
    goalId: z.string().uuid(),
    source: goalMoveSourceSchema.optional().default('manual'),
  }),
  z.object({
    templateKey: z.literal('reduce-category'),
    params: reduceCategoryParamsSchema,
    goalId: z.string().uuid(),
    source: goalMoveSourceSchema.optional().default('manual'),
  }),
  z.object({
    templateKey: z.literal('income-event'),
    params: incomeEventParamsSchema,
    goalId: z.string().uuid(),
    source: goalMoveSourceSchema.optional().default('manual'),
  }),
]);

export type GoalMoveInput = z.infer<typeof goalMoveInputSchema>;

// /simulator — all four templates allowed. No `source` field (per schema.ts
// scenario_move table — source is goal-specific).
export const scenarioMoveInputSchema = z.discriminatedUnion('templateKey', [
  z.object({
    templateKey: z.literal('adjust-recurring'),
    params: adjustRecurringParamsSchema,
    scenarioId: z.string().uuid(),
  }),
  z.object({
    templateKey: z.literal('reduce-category'),
    params: reduceCategoryParamsSchema,
    scenarioId: z.string().uuid(),
  }),
  z.object({
    templateKey: z.literal('income-event'),
    params: incomeEventParamsSchema,
    scenarioId: z.string().uuid(),
  }),
  z.object({
    templateKey: z.literal('skip-once'),
    params: skipOnceParamsSchema,
    scenarioId: z.string().uuid(),
  }),
]);

export type ScenarioMoveInput = z.infer<typeof scenarioMoveInputSchema>;

// =============================================================================
// templateKey type — narrow union exported for consumers
// =============================================================================

export const MOVE_TEMPLATE_KEYS = [
  'adjust-recurring',
  'reduce-category',
  'income-event',
  'skip-once',
] as const;

export type MoveTemplateKey = (typeof MOVE_TEMPLATE_KEYS)[number];
