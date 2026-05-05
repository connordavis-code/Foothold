import { z } from 'zod';

const monthString = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const scenarioOverridesSchema = z.object({
  horizonMonths: z.number().int().positive().max(120).optional(),

  categoryDeltas: z.array(z.object({
    categoryId: z.string().uuid(),
    monthlyDelta: z.number(),
    startMonth: monthString.optional(),
    endMonth: monthString.optional(),
  })).optional(),

  lumpSums: z.array(z.object({
    id: z.string(),
    label: z.string().min(1).max(100),
    amount: z.number(),
    month: monthString,
  })).optional(),

  recurringChanges: z.array(z.object({
    streamId: z.string().uuid().optional(),
    action: z.enum(['pause', 'edit', 'add']),
    label: z.string().min(1).max(100).optional(),
    amount: z.number().nonnegative().optional(),
    direction: z.enum(['inflow', 'outflow']).optional(),
    cadence: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
    startMonth: monthString.optional(),
    endMonth: monthString.optional(),
  })).optional(),

  incomeDelta: z.object({
    monthlyDelta: z.number(),
    startMonth: monthString.optional(),
    endMonth: monthString.optional(),
  }).optional(),

  hypotheticalGoals: z.array(z.object({
    id: z.string(),
    name: z.string().min(1).max(100),
    targetAmount: z.number().positive(),
    targetDate: dateString.optional(),
    monthlyContribution: z.number().nonnegative().optional(),
  })).optional(),

  goalTargetEdits: z.array(z.object({
    goalId: z.string().uuid(),
    newTargetAmount: z.number().positive().optional(),
    newTargetDate: dateString.optional(),
    newMonthlyContribution: z.number().nonnegative().optional(),
  })).optional(),

  skipRecurringInstances: z.array(z.object({
    streamId: z.string().uuid(),
    skipMonth: monthString,
  })).optional(),
});

export const createScenarioInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  overrides: scenarioOverridesSchema.default({}),
});

export const updateScenarioInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  overrides: scenarioOverridesSchema.optional(),
});

export const deleteScenarioInput = z.object({
  id: z.string().uuid(),
});
