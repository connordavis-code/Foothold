import { describe, it, expect } from 'vitest';
import {
  validateMonthField,
  validateAmountField,
  validateMonthsField,
  validateStreamId,
} from './validation';

describe('validateMonthField', () => {
  it('accepts a valid YYYY-MM in future or current', () => {
    expect(validateMonthField('2026-07', '2026-07')).toBeNull();
    expect(validateMonthField('2027-12', '2026-07')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(validateMonthField('2026-7', '2026-07')).toMatch(/format/);
    expect(validateMonthField('', '2026-07')).toMatch(/required/);
    expect(validateMonthField('abcd-ef', '2026-07')).toMatch(/format/);
  });

  it('rejects past months', () => {
    expect(validateMonthField('2025-12', '2026-07')).toMatch(/past/);
  });
});

describe('validateAmountField', () => {
  it('accepts positive amounts', () => {
    expect(validateAmountField(100)).toBeNull();
    expect(validateAmountField(0.01)).toBeNull();
  });

  it('rejects zero and negative', () => {
    expect(validateAmountField(0)).toMatch(/positive/);
    expect(validateAmountField(-50)).toMatch(/positive/);
  });

  it('rejects non-finite', () => {
    expect(validateAmountField(Number.NaN)).toMatch(/positive/);
    expect(validateAmountField(Number.POSITIVE_INFINITY)).toMatch(/positive/);
  });
});

describe('validateMonthsField', () => {
  it('accepts positive integers', () => {
    expect(validateMonthsField(1)).toBeNull();
    expect(validateMonthsField(12)).toBeNull();
  });

  it('rejects zero unless 0 is explicitly allowed', () => {
    expect(validateMonthsField(0)).toMatch(/at least 1/);
    expect(validateMonthsField(0, { allowZero: true })).toBeNull();
  });

  it('rejects non-integer values', () => {
    expect(validateMonthsField(1.5)).toMatch(/integer/);
  });
});

describe('validateStreamId', () => {
  it('accepts non-empty', () => {
    expect(validateStreamId('stream-1')).toBeNull();
  });

  it('rejects empty / undefined', () => {
    expect(validateStreamId('')).toMatch(/required/);
    expect(validateStreamId(undefined)).toMatch(/required/);
  });
});
