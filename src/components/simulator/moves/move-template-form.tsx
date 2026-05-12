'use client';

import { useMemo, useState } from 'react';
import type { MoveTemplate, MoveFieldKind } from '@/lib/simulator/moves/templates';

type Props = {
  template: MoveTemplate;
  currentMonth: string;
  availableMonths: string[];
  recurringStreams: Array<{ id: string; label: string; direction: 'inflow' | 'outflow' }>;
  conflictMessage: string | null;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
};

export function MoveTemplateForm({
  template,
  currentMonth,
  availableMonths,
  recurringStreams,
  conflictMessage,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(() => seedDefaults(template, currentMonth));
  const [submitting, setSubmitting] = useState(false);

  const errors = useMemo(
    () => template.validator(values, currentMonth),
    [template, values, currentMonth],
  );
  const hasErrors = Object.values(errors).some((e) => e !== null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasErrors) return;
    setSubmitting(true);
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-1">
      {conflictMessage && (
        <div className="rounded-btn border border-hairline bg-bg-2 p-3 text-xs text-text-2">
          ⚠ {conflictMessage}
        </div>
      )}

      {Object.entries(template.fields).map(([key, field]) => (
        <Field
          key={key}
          name={key}
          field={field}
          value={values[key]}
          error={errors[key]}
          availableMonths={availableMonths}
          recurringStreams={recurringStreams}
          onChange={(v) => setValues((p) => ({ ...p, [key]: v }))}
        />
      ))}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-btn border border-hairline px-3 py-1.5 text-sm text-text-2 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={hasErrors || submitting}
          className="rounded-btn border border-hairline bg-foreground px-3 py-1.5 text-sm text-bg disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </form>
  );
}

function seedDefaults(template: MoveTemplate, currentMonth: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(template.fields)) {
    if (field.kind === 'month') out[key] = currentMonth;
    else if (field.kind === 'currency') out[key] = 0;
    else if (field.kind === 'integerMonths') out[key] = 3;
    else if (field.kind === 'streamPicker') out[key] = '';
    else if (field.kind === 'text') out[key] = '';
    else if (field.kind === 'directionToggle') out[key] = 'outflow';
  }
  return out;
}

type FieldProps = {
  name: string;
  field: MoveFieldKind;
  value: unknown;
  error: string | null;
  availableMonths: string[];
  recurringStreams: Array<{ id: string; label: string; direction: 'inflow' | 'outflow' }>;
  onChange: (v: unknown) => void;
};

function Field({ name, field, value, error, availableMonths, recurringStreams, onChange }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-eyebrow">{field.label}</span>
      {field.kind === 'month' && (
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
        >
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
      {field.kind === 'currency' && (
        <input
          type="number"
          inputMode="decimal"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm font-mono tabular-nums"
        />
      )}
      {field.kind === 'integerMonths' && (
        <input
          type="number"
          inputMode="numeric"
          value={value as number}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm font-mono tabular-nums"
        />
      )}
      {field.kind === 'text' && (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
        />
      )}
      {field.kind === 'directionToggle' && (
        <div className="inline-flex rounded-btn border border-hairline">
          {(['outflow', 'inflow'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              className={`px-3 py-1.5 text-sm ${value === d ? 'bg-foreground text-bg' : 'text-text-2'}`}
            >
              {d === 'outflow' ? 'Outflow' : 'Inflow'}
            </button>
          ))}
        </div>
      )}
      {field.kind === 'streamPicker' && (
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">Select…</option>
          {recurringStreams
            .filter((s) => !field.direction || s.direction === field.direction)
            .map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
        </select>
      )}
      {('helpText' in field) && field.helpText && !error && (
        <span className="text-xs text-text-3">{field.helpText}</span>
      )}
      {error && <span className="text-xs" style={{ color: 'var(--semantic-caution)' }}>{error}</span>}
    </label>
  );
}

export default MoveTemplateForm;
