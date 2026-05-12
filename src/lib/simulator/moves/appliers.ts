import type { ScenarioOverrides } from '@/lib/forecast/types';

// ----------------------------------------------------------------
// Income-affecting Moves — single-valued incomeDelta (last-wins).
// ----------------------------------------------------------------

export type IncomeChangeForm = {
  when: string;                // YYYY-MM
  newMonthlyAmount: number;    // signed delta vs current income
};

export function applyIncomeChange(
  form: IncomeChangeForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    incomeDelta: {
      monthlyDelta: form.newMonthlyAmount,
      startMonth: form.when,
    },
  };
}

export type PayRaiseForm = {
  when: string;
  increaseMonthly: number;    // expected positive
};

export function applyPayRaise(
  form: PayRaiseForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    incomeDelta: {
      monthlyDelta: form.increaseMonthly,
      startMonth: form.when,
    },
  };
}

export type JobLossForm = {
  when: string;
  months: number;             // 0 = permanent
  currentMonthlyIncome: number; // for the delta calculation
};

export function applyJobLoss(
  form: JobLossForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  const endMonth = form.months > 0 ? addMonths(form.when, form.months - 1) : undefined;
  return {
    ...current,
    incomeDelta: {
      monthlyDelta: -form.currentMonthlyIncome,
      startMonth: form.when,
      ...(endMonth ? { endMonth } : {}),
    },
  };
}

// ----------------------------------------------------------------
// Lump-sum Moves — array, additive (no dedup; each is a distinct event).
// ----------------------------------------------------------------

export type BigPurchaseForm = {
  when: string;
  amount: number;             // expected positive; emitted as negative
};

export function applyBigPurchase(
  form: BigPurchaseForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    lumpSums: [
      ...(current.lumpSums ?? []),
      {
        id: generateId(),
        label: 'Big purchase',
        amount: -Math.abs(form.amount),
        month: form.when,
      },
    ],
  };
}

export type BonusForm = {
  when: string;
  amount: number;             // expected positive; emitted as positive
};

export function applyBonus(
  form: BonusForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    lumpSums: [
      ...(current.lumpSums ?? []),
      {
        id: generateId(),
        label: 'Bonus',
        amount: Math.abs(form.amount),
        month: form.when,
      },
    ],
  };
}

// ----------------------------------------------------------------
// Recurring-changes Moves — array, dedupe by streamId for pause/cancel.
// ----------------------------------------------------------------

export type NewRecurringForm = {
  when: string;
  amount: number;
  name: string;
  direction: 'inflow' | 'outflow';
};

export function applyNewRecurring(
  form: NewRecurringForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  return {
    ...current,
    recurringChanges: [
      ...(current.recurringChanges ?? []),
      {
        action: 'add',
        label: form.name,
        amount: form.amount,
        direction: form.direction,
        cadence: 'monthly',
        startMonth: form.when,
      },
    ],
  };
}

export type PauseRecurringForm = {
  streamId: string;
  startMonth: string;
  months: number;             // >0 expected
};

export function applyPauseRecurring(
  form: PauseRecurringForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  const endMonth = addMonths(form.startMonth, form.months - 1);
  const others = (current.recurringChanges ?? []).filter(
    (rc) => !(rc.streamId === form.streamId && rc.action === 'pause'),
  );
  return {
    ...current,
    recurringChanges: [
      ...others,
      {
        streamId: form.streamId,
        action: 'pause',
        startMonth: form.startMonth,
        endMonth,
      },
    ],
  };
}

export type CancelSubForm = {
  streamId: string;
  startMonth: string;         // typically currentMonth
};

export function applyCancelSub(
  form: CancelSubForm,
  current: ScenarioOverrides,
): ScenarioOverrides {
  const others = (current.recurringChanges ?? []).filter(
    (rc) => !(rc.streamId === form.streamId && rc.action === 'pause'),
  );
  return {
    ...current,
    recurringChanges: [
      ...others,
      {
        streamId: form.streamId,
        action: 'pause',
        startMonth: form.startMonth,
        // endMonth omitted → permanent per data model
      },
    ],
  };
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function addMonths(yyyymm: string, n: number): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function generateId(): string {
  return `mv_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
