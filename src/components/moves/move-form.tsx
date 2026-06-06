'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { humanizeCategory } from '@/lib/format/category';
import { cn } from '@/lib/utils';
import type { MoveTemplateKey } from '@/lib/moves/validation';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

// =============================================================================
// Public types
// =============================================================================

export type CategoryOption = {
  key: string;
  label: string; // humanizeCategory(key) — caller pre-formats via humanizeCategory
};

export type MoveFormValues =
  | {
      templateKey: 'adjust-recurring';
      params: {
        streamId: string;
        newAmount: number;
        startMonth: string;
        endMonth?: string;
      };
    }
  | {
      templateKey: 'reduce-category';
      params: {
        categoryKey: string;
        deltaAmount: number;
        startMonth: string;
        endMonth?: string;
      };
    }
  | {
      templateKey: 'income-event';
      params: {
        monthlyAmount: number;
        startMonth: string;
        endMonth?: string;
      };
    }
  | {
      templateKey: 'skip-once';
      params: {
        streamId: string;
        month: string;
      };
    };

type Props = {
  templateKey: MoveTemplateKey;
  streams: RecurringStreamRow[];
  categories: CategoryOption[];
  prefillParams?: Record<string, unknown>;
  // Called by MoveEditor; returns error string on failure.
  onSubmit: (values: MoveFormValues) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel?: () => void;
};

// =============================================================================
// Helpers
// =============================================================================

// Browser <input type="month"> emits YYYY-MM — matches monthString regex.
// Validation layer expects exactly YYYY-MM so no suffix needed.
function todayYYYYMM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function labelInputClass(extra?: string) {
  return cn(
    'rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground',
    'focus:outline-none focus:ring-1 focus:ring-ring',
    extra,
  );
}

// =============================================================================
// Per-template sub-forms
// =============================================================================

function AdjustRecurringFields({
  streams,
  prefill,
  onChange,
}: {
  streams: RecurringStreamRow[];
  prefill?: Record<string, unknown>;
  onChange: (p: { streamId: string; newAmount: number; startMonth: string; endMonth?: string }) => void;
}) {
  const today = todayYYYYMM();
  const [streamId, setStreamId] = useState<string>(
    (prefill?.streamId as string | undefined) ?? '',
  );
  const [newAmount, setNewAmount] = useState<number>(
    typeof prefill?.newAmount === 'number' ? prefill.newAmount : 0,
  );
  const [startMonth, setStartMonth] = useState<string>(
    (prefill?.startMonth as string | undefined) ?? today,
  );
  const [endMonth, setEndMonth] = useState<string>(
    (prefill?.endMonth as string | undefined) ?? '',
  );

  function emit(overrides?: Partial<{ streamId: string; newAmount: number; startMonth: string; endMonth: string }>) {
    const s = overrides?.streamId ?? streamId;
    const a = overrides?.newAmount ?? newAmount;
    const sm = overrides?.startMonth ?? startMonth;
    const em = overrides?.endMonth ?? endMonth;
    onChange({ streamId: s, newAmount: a, startMonth: sm, ...(em ? { endMonth: em } : {}) });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Recurring charge</span>
        <Select
          value={streamId}
          onValueChange={(v) => { setStreamId(v); emit({ streamId: v }); }}
        >
          <SelectTrigger className={labelInputClass()}>
            <SelectValue placeholder="Select a recurring charge…" />
          </SelectTrigger>
          <SelectContent>
            {streams.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.merchantName ?? s.description ?? s.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">New monthly amount ($)</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={newAmount}
          onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setNewAmount(v); emit({ newAmount: v }); }}
          onFocus={(e) => e.target.select()}
          className={labelInputClass('font-mono tabular-nums')}
        />
        <span className="text-xs text-muted-foreground">Set to 0 to pause entirely.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Start month</span>
        <input
          type="month"
          value={startMonth}
          onChange={(e) => { setStartMonth(e.target.value); emit({ startMonth: e.target.value }); }}
          className={labelInputClass()}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">End month (optional)</span>
        <input
          type="month"
          value={endMonth}
          onChange={(e) => { setEndMonth(e.target.value); emit({ endMonth: e.target.value }); }}
          className={labelInputClass()}
        />
        <span className="text-xs text-muted-foreground">Leave blank to apply indefinitely.</span>
      </label>
    </div>
  );
}

function ReduceCategoryFields({
  categories,
  prefill,
  onChange,
}: {
  categories: CategoryOption[];
  prefill?: Record<string, unknown>;
  onChange: (p: { categoryKey: string; deltaAmount: number; startMonth: string; endMonth?: string }) => void;
}) {
  const today = todayYYYYMM();
  const [categoryKey, setCategoryKey] = useState<string>(
    (prefill?.categoryKey as string | undefined) ?? '',
  );
  const [deltaAmount, setDeltaAmount] = useState<number>(
    typeof prefill?.deltaAmount === 'number' ? prefill.deltaAmount : 0,
  );
  const [startMonth, setStartMonth] = useState<string>(
    (prefill?.startMonth as string | undefined) ?? today,
  );
  const [endMonth, setEndMonth] = useState<string>(
    (prefill?.endMonth as string | undefined) ?? '',
  );

  function emit(overrides?: Partial<{ categoryKey: string; deltaAmount: number; startMonth: string; endMonth: string }>) {
    const k = overrides?.categoryKey ?? categoryKey;
    const d = overrides?.deltaAmount ?? deltaAmount;
    const sm = overrides?.startMonth ?? startMonth;
    const em = overrides?.endMonth ?? endMonth;
    onChange({ categoryKey: k, deltaAmount: d, startMonth: sm, ...(em ? { endMonth: em } : {}) });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Category</span>
        <Select
          value={categoryKey}
          onValueChange={(v) => { setCategoryKey(v); emit({ categoryKey: v }); }}
        >
          <SelectTrigger className={labelInputClass()}>
            <SelectValue placeholder="Select a category…" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label || humanizeCategory(c.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Monthly reduction ($)</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={deltaAmount}
          onChange={(e) => { const v = Number(e.target.value); setDeltaAmount(v); emit({ deltaAmount: v }); }}
          onFocus={(e) => e.target.select()}
          className={labelInputClass('font-mono tabular-nums')}
        />
        <span className="text-xs text-muted-foreground">Positive magnitude — applier handles the sign.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Start month</span>
        <input
          type="month"
          value={startMonth}
          onChange={(e) => { setStartMonth(e.target.value); emit({ startMonth: e.target.value }); }}
          className={labelInputClass()}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">End month (optional)</span>
        <input
          type="month"
          value={endMonth}
          onChange={(e) => { setEndMonth(e.target.value); emit({ endMonth: e.target.value }); }}
          className={labelInputClass()}
        />
        <span className="text-xs text-muted-foreground">Leave blank to apply indefinitely.</span>
      </label>
    </div>
  );
}

function IncomeEventFields({
  prefill,
  onChange,
}: {
  prefill?: Record<string, unknown>;
  onChange: (p: { monthlyAmount: number; startMonth: string; endMonth?: string }) => void;
}) {
  const today = todayYYYYMM();
  const [monthlyAmount, setMonthlyAmount] = useState<number>(
    typeof prefill?.monthlyAmount === 'number' ? prefill.monthlyAmount : 0,
  );
  const [startMonth, setStartMonth] = useState<string>(
    (prefill?.startMonth as string | undefined) ?? today,
  );
  const [endMonth, setEndMonth] = useState<string>(
    (prefill?.endMonth as string | undefined) ?? '',
  );

  function emit(overrides?: Partial<{ monthlyAmount: number; startMonth: string; endMonth: string }>) {
    const a = overrides?.monthlyAmount ?? monthlyAmount;
    const sm = overrides?.startMonth ?? startMonth;
    const em = overrides?.endMonth ?? endMonth;
    onChange({ monthlyAmount: a, startMonth: sm, ...(em ? { endMonth: em } : {}) });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Monthly amount ($)</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={monthlyAmount}
          onChange={(e) => { const v = Number(e.target.value); setMonthlyAmount(v); emit({ monthlyAmount: v }); }}
          onFocus={(e) => e.target.select()}
          className={labelInputClass('font-mono tabular-nums')}
        />
        <span className="text-xs text-muted-foreground">
          Positive = raise / bonus. Negative = pay cut / job loss. Cannot be zero.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Start month</span>
        <input
          type="month"
          value={startMonth}
          onChange={(e) => { setStartMonth(e.target.value); emit({ startMonth: e.target.value }); }}
          className={labelInputClass()}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">End month (optional)</span>
        <input
          type="month"
          value={endMonth}
          onChange={(e) => { setEndMonth(e.target.value); emit({ endMonth: e.target.value }); }}
          className={labelInputClass()}
        />
        <span className="text-xs text-muted-foreground">Leave blank to apply indefinitely.</span>
      </label>
    </div>
  );
}

function SkipOnceFields({
  streams,
  prefill,
  onChange,
}: {
  streams: RecurringStreamRow[];
  prefill?: Record<string, unknown>;
  onChange: (p: { streamId: string; month: string }) => void;
}) {
  const today = todayYYYYMM();
  const [streamId, setStreamId] = useState<string>(
    (prefill?.streamId as string | undefined) ?? '',
  );
  const [month, setMonth] = useState<string>(
    (prefill?.month as string | undefined) ?? today,
  );

  function emit(overrides?: Partial<{ streamId: string; month: string }>) {
    onChange({ streamId: overrides?.streamId ?? streamId, month: overrides?.month ?? month });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Recurring charge</span>
        <Select
          value={streamId}
          onValueChange={(v) => { setStreamId(v); emit({ streamId: v }); }}
        >
          <SelectTrigger className={labelInputClass()}>
            <SelectValue placeholder="Select a recurring charge…" />
          </SelectTrigger>
          <SelectContent>
            {streams.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.merchantName ?? s.description ?? s.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Month to skip</span>
        <input
          type="month"
          value={month}
          onChange={(e) => { setMonth(e.target.value); emit({ month: e.target.value }); }}
          className={labelInputClass()}
        />
      </label>
    </div>
  );
}

// =============================================================================
// MoveForm — config-driven renderer
// =============================================================================

export function MoveForm({
  templateKey,
  streams,
  categories,
  prefillParams,
  onSubmit,
  onCancel,
}: Props) {
  // pendingParams holds the latest field values bubbled up from child forms.
  // Zod parse happens at submit time — no live error display during typing.
  const [pendingParams, setPendingParams] = useState<Record<string, unknown>>(
    prefillParams ?? {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Build the typed MoveFormValues from pendingParams.
    let values: MoveFormValues;
    if (templateKey === 'adjust-recurring') {
      values = {
        templateKey: 'adjust-recurring',
        params: {
          streamId: pendingParams.streamId as string,
          newAmount: pendingParams.newAmount as number,
          startMonth: pendingParams.startMonth as string,
          ...(pendingParams.endMonth ? { endMonth: pendingParams.endMonth as string } : {}),
        },
      };
    } else if (templateKey === 'reduce-category') {
      values = {
        templateKey: 'reduce-category',
        params: {
          categoryKey: pendingParams.categoryKey as string,
          deltaAmount: pendingParams.deltaAmount as number,
          startMonth: pendingParams.startMonth as string,
          ...(pendingParams.endMonth ? { endMonth: pendingParams.endMonth as string } : {}),
        },
      };
    } else if (templateKey === 'income-event') {
      values = {
        templateKey: 'income-event',
        params: {
          monthlyAmount: pendingParams.monthlyAmount as number,
          startMonth: pendingParams.startMonth as string,
          ...(pendingParams.endMonth ? { endMonth: pendingParams.endMonth as string } : {}),
        },
      };
    } else {
      // skip-once (simulator only)
      values = {
        templateKey: 'skip-once',
        params: {
          streamId: pendingParams.streamId as string,
          month: pendingParams.month as string,
        },
      };
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await onSubmit(values);
      if (!result.ok) {
        setSubmitError(result.error);
      }
      // On success, parent (MoveEditor) handles state reset / close via onAttached.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {templateKey === 'adjust-recurring' && (
        <AdjustRecurringFields
          streams={streams}
          prefill={prefillParams}
          onChange={(p) => setPendingParams(p)}
        />
      )}
      {templateKey === 'reduce-category' && (
        <ReduceCategoryFields
          categories={categories}
          prefill={prefillParams}
          onChange={(p) => setPendingParams(p)}
        />
      )}
      {templateKey === 'income-event' && (
        <IncomeEventFields
          prefill={prefillParams}
          onChange={(p) => setPendingParams(p)}
        />
      )}
      {templateKey === 'skip-once' && (
        <SkipOnceFields
          streams={streams}
          prefill={prefillParams}
          onChange={(p) => setPendingParams(p)}
        />
      )}

      {submitError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {submitError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md border border-foreground/20 bg-foreground px-4 py-1.5 text-sm text-background disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {submitting ? 'Applying…' : 'Apply move'}
        </button>
      </div>
    </form>
  );
}
