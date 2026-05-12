import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp,
  ShoppingBag,
  Sparkles,
  CircleSlash,
  Repeat,
  PauseCircle,
  Gift,
  XCircle,
} from 'lucide-react';
import type { ScenarioOverrides } from '@/lib/forecast/types';
import {
  applyIncomeChange,
  applyBigPurchase,
  applyPayRaise,
  applyJobLoss,
  applyNewRecurring,
  applyPauseRecurring,
  applyBonus,
  applyCancelSub,
} from './appliers';
import {
  validateMonthField,
  validateAmountField,
  validateMonthsField,
  validateStreamId,
} from './validation';

export type MoveTemplateId =
  | 'incomeChange'
  | 'bigPurchase'
  | 'payRaise'
  | 'jobLoss'
  | 'newRecurring'
  | 'pauseRecurring'
  | 'bonus'
  | 'cancelSub';

export type MoveFieldKind =
  | { kind: 'month'; label: string; helpText?: string }
  | { kind: 'currency'; label: string; helpText?: string }
  | { kind: 'integerMonths'; label: string; helpText?: string }
  | { kind: 'streamPicker'; label: string; direction?: 'outflow' | 'inflow' }
  | { kind: 'text'; label: string; helpText?: string }
  | { kind: 'directionToggle'; label: string };

export type OverrideSectionKey =
  | 'categories'
  | 'lumpSums'
  | 'recurring'
  | 'income'
  | 'hypotheticalGoals'
  | 'goalTargetEdits'
  | 'skipRecurring';

export type MoveTemplate = {
  id: MoveTemplateId;
  icon: LucideIcon;
  title: string;
  description: string;
  fields: Record<string, MoveFieldKind>;
  applier: (formValues: Record<string, unknown>, current: ScenarioOverrides) => ScenarioOverrides;
  validator: (formValues: Record<string, unknown>, currentMonth: string) => Record<string, string | null>;
  targetSection: OverrideSectionKey;
  conflictsWith?: (current: ScenarioOverrides) => string | null; // returns warning message or null
};

/**
 * Eight Move templates. Each is a fully self-contained config: presentation
 * (icon, title, description), inputs (fields), behavior (applier + validator),
 * and post-submit hint (targetSection — which accordion to auto-expand).
 *
 * NEVER reference these from a server component. The applier + validator
 * functions are CLOSURES in this file's module scope and cannot cross the
 * RSC boundary. Strike-3 watch in effect — see CLAUDE.md.
 */
export const MOVE_TEMPLATES: MoveTemplate[] = [
  {
    id: 'incomeChange',
    icon: TrendingUp,
    title: 'Income change',
    description: 'Raise, side income, or stipend',
    fields: {
      when: { kind: 'month', label: 'When' },
      newMonthlyAmount: { kind: 'currency', label: 'Change ($/mo)', helpText: 'Signed: positive for an increase, negative for a decrease.' },
    },
    applier: (v, current) =>
      applyIncomeChange({ when: v.when as string, newMonthlyAmount: v.newMonthlyAmount as number }, current),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      newMonthlyAmount: validateAmountField(Math.abs((v.newMonthlyAmount as number) ?? 0)),
    }),
    targetSection: 'income',
    conflictsWith: (current) =>
      current.incomeDelta
        ? `This will replace your existing income override (${formatMoney(current.incomeDelta.monthlyDelta)}/mo starting ${current.incomeDelta.startMonth ?? 'soon'}).`
        : null,
  },

  {
    id: 'bigPurchase',
    icon: ShoppingBag,
    title: 'Big purchase',
    description: 'Lump sum that hits one month',
    fields: {
      when: { kind: 'month', label: 'When' },
      amount: { kind: 'currency', label: 'Amount' },
    },
    applier: (v, current) =>
      applyBigPurchase({ when: v.when as string, amount: v.amount as number }, current),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      amount: validateAmountField(v.amount as number),
    }),
    targetSection: 'lumpSums',
  },

  {
    id: 'payRaise',
    icon: Sparkles,
    title: 'Pay raise',
    description: 'Recurring increase from date',
    fields: {
      when: { kind: 'month', label: 'Starts' },
      increaseMonthly: { kind: 'currency', label: 'Increase ($/mo)' },
    },
    applier: (v, current) =>
      applyPayRaise({ when: v.when as string, increaseMonthly: v.increaseMonthly as number }, current),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      increaseMonthly: validateAmountField(v.increaseMonthly as number),
    }),
    targetSection: 'income',
    conflictsWith: (current) =>
      current.incomeDelta
        ? `This will replace your existing income override.`
        : null,
  },

  {
    id: 'jobLoss',
    icon: CircleSlash,
    title: 'Job loss',
    description: 'Pause income for N months',
    fields: {
      when: { kind: 'month', label: 'Starts' },
      months: { kind: 'integerMonths', label: 'For how many months', helpText: '0 = permanent' },
    },
    applier: (v, current) =>
      applyJobLoss(
        {
          when: v.when as string,
          months: v.months as number,
          currentMonthlyIncome: (v.currentMonthlyIncome as number) ?? 0, // supplied by drawer
        },
        current,
      ),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      months: validateMonthsField(v.months as number, { allowZero: true }),
    }),
    targetSection: 'income',
    conflictsWith: (current) =>
      current.incomeDelta
        ? `This will replace your existing income override.`
        : null,
  },

  {
    id: 'newRecurring',
    icon: Repeat,
    title: 'New recurring',
    description: 'Add monthly charge',
    fields: {
      when: { kind: 'month', label: 'Starts' },
      amount: { kind: 'currency', label: 'Amount ($/mo)' },
      name: { kind: 'text', label: 'Name' },
      direction: { kind: 'directionToggle', label: 'In or out' },
    },
    applier: (v, current) =>
      applyNewRecurring(
        {
          when: v.when as string,
          amount: v.amount as number,
          name: v.name as string,
          direction: v.direction as 'inflow' | 'outflow',
        },
        current,
      ),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      amount: validateAmountField(v.amount as number),
      name: (v.name as string)?.trim() ? null : 'Required',
    }),
    targetSection: 'recurring',
  },

  {
    id: 'pauseRecurring',
    icon: PauseCircle,
    title: 'Pause recurring',
    description: 'Skip a known charge',
    fields: {
      streamId: { kind: 'streamPicker', label: 'Which charge', direction: 'outflow' },
      startMonth: { kind: 'month', label: 'Starting' },
      months: { kind: 'integerMonths', label: 'For how many months' },
    },
    applier: (v, current) =>
      applyPauseRecurring(
        {
          streamId: v.streamId as string,
          startMonth: v.startMonth as string,
          months: v.months as number,
        },
        current,
      ),
    validator: (v, currentMonth) => ({
      streamId: validateStreamId(v.streamId as string),
      startMonth: validateMonthField(v.startMonth as string, currentMonth),
      months: validateMonthsField(v.months as number),
    }),
    targetSection: 'recurring',
  },

  {
    id: 'bonus',
    icon: Gift,
    title: 'Bonus',
    description: 'One-time cash inflow',
    fields: {
      when: { kind: 'month', label: 'When' },
      amount: { kind: 'currency', label: 'Amount' },
    },
    applier: (v, current) =>
      applyBonus({ when: v.when as string, amount: v.amount as number }, current),
    validator: (v, currentMonth) => ({
      when: validateMonthField(v.when as string, currentMonth),
      amount: validateAmountField(v.amount as number),
    }),
    targetSection: 'lumpSums',
  },

  {
    id: 'cancelSub',
    icon: XCircle,
    title: 'Cancel subs',
    description: 'Trim recurring outflow',
    fields: {
      streamId: { kind: 'streamPicker', label: 'Which charge', direction: 'outflow' },
      startMonth: { kind: 'month', label: 'Starting' },
    },
    applier: (v, current) =>
      applyCancelSub(
        { streamId: v.streamId as string, startMonth: v.startMonth as string },
        current,
      ),
    validator: (v, currentMonth) => ({
      streamId: validateStreamId(v.streamId as string),
      startMonth: validateMonthField(v.startMonth as string, currentMonth),
    }),
    targetSection: 'recurring',
  },
];

export function findTemplate(id: MoveTemplateId): MoveTemplate | null {
  return MOVE_TEMPLATES.find((t) => t.id === id) ?? null;
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '+';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
