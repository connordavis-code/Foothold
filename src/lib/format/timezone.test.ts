import { describe, it, expect } from 'vitest';
import { isValidIanaTimezone, TIMEZONE_OPTIONS } from './timezone';

describe('isValidIanaTimezone', () => {
  it('accepts UTC', () => {
    expect(isValidIanaTimezone('UTC')).toBe(true);
  });

  it('accepts America/Los_Angeles', () => {
    expect(isValidIanaTimezone('America/Los_Angeles')).toBe(true);
  });

  it('accepts Europe/Berlin', () => {
    expect(isValidIanaTimezone('Europe/Berlin')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidIanaTimezone('')).toBe(false);
  });

  it('rejects gibberish', () => {
    expect(isValidIanaTimezone('Not/A_Real_Zone')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidIanaTimezone(null)).toBe(false);
    expect(isValidIanaTimezone(undefined)).toBe(false);
  });
});

describe('TIMEZONE_OPTIONS', () => {
  it('includes UTC as the first option', () => {
    expect(TIMEZONE_OPTIONS[0]).toEqual({ value: 'UTC', label: 'UTC' });
  });

  it('every option has a value that passes isValidIanaTimezone', () => {
    for (const opt of TIMEZONE_OPTIONS) {
      expect(isValidIanaTimezone(opt.value)).toBe(true);
    }
  });

  it('every option has a non-empty label', () => {
    for (const opt of TIMEZONE_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});
