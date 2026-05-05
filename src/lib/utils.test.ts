import { describe, expect, it } from 'vitest';
import { formatCurrency, formatPercent } from './utils';

describe('formatCurrency', () => {
  it('formats positive amounts with thousands separators', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('formats negative amounts with a minus sign', () => {
    expect(formatCurrency(-50)).toBe('-$50.00');
  });

  it('forces a leading + when signed: true', () => {
    expect(formatCurrency(50, { signed: true })).toBe('+$50.00');
  });

  it('renders compact notation for large amounts', () => {
    expect(formatCurrency(1_234_567, { compact: true })).toBe('$1.2M');
  });
});

describe('formatPercent', () => {
  it('renders a percent with one decimal by default', () => {
    expect(formatPercent(0.0734)).toBe('7.3%');
  });

  it('honors a custom decimal count', () => {
    expect(formatPercent(0.0734, 2)).toBe('7.34%');
  });
});
