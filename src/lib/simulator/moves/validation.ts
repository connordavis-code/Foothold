/**
 * Per-field validators returning null on success or a user-facing error
 * string on failure. Composed in templates.ts into per-template validators.
 */

export function validateMonthField(
  value: string | undefined,
  currentMonth: string,
): string | null {
  if (!value) return 'required';
  if (!/^\d{4}-\d{2}$/.test(value)) return 'format must be YYYY-MM';
  if (value < currentMonth) return 'Must not be in the past';
  return null;
}

export function validateAmountField(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return 'Must be positive';
  return null;
}

type MonthsOptions = { allowZero?: boolean };

export function validateMonthsField(
  value: number,
  options: MonthsOptions = {},
): string | null {
  if (!Number.isInteger(value)) return 'Must be a whole number (integer)';
  const min = options.allowZero ? 0 : 1;
  if (value < min) return options.allowZero ? 'Must be at least 0' : 'Must be at least 1';
  return null;
}

export function validateStreamId(value: string | undefined): string | null {
  if (!value) return 'required';
  return null;
}
