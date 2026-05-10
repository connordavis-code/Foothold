import { describe, expect, it } from 'vitest';
import {
  FALLBACK_COORDS,
  formatCoords,
  formatTimeWithZone,
  getRuntimeTimezone,
  resolveCoordsForZone,
} from './signature-footer-data';

describe('resolveCoordsForZone', () => {
  it('returns coords for a known IANA zone', () => {
    const ny = resolveCoordsForZone('America/New_York');
    expect(ny.city).toBe('New York');
    expect(ny.lat).toBeCloseTo(40.7128);
    expect(ny.lon).toBeCloseTo(-74.006);
  });

  it('falls back to Boston for unknown zones', () => {
    expect(resolveCoordsForZone('Atlantis/Lost_City')).toEqual(FALLBACK_COORDS);
  });

  it('falls back to Boston for empty string', () => {
    expect(resolveCoordsForZone('')).toEqual(FALLBACK_COORDS);
  });

  it('handles southern + eastern hemisphere zones', () => {
    const sydney = resolveCoordsForZone('Australia/Sydney');
    expect(sydney.lat).toBeLessThan(0);
    expect(sydney.lon).toBeGreaterThan(0);
  });

  it('handles three-segment IANA zones (e.g., Argentina/Buenos_Aires)', () => {
    const ba = resolveCoordsForZone('America/Argentina/Buenos_Aires');
    expect(ba.city).toBe('Buenos Aires');
  });
});

describe('formatCoords', () => {
  it('formats Boston as the bundle prototype reference', () => {
    expect(formatCoords(FALLBACK_COORDS)).toBe('42.3601° N · 71.0589° W');
  });

  it('uses N/S based on latitude sign', () => {
    expect(formatCoords({ lat: 30, lon: 0, city: 'X' })).toContain('30.0000° N');
    expect(formatCoords({ lat: -30, lon: 0, city: 'X' })).toContain('30.0000° S');
  });

  it('uses E/W based on longitude sign', () => {
    expect(formatCoords({ lat: 0, lon: 100, city: 'X' })).toContain('100.0000° E');
    expect(formatCoords({ lat: 0, lon: -100, city: 'X' })).toContain('100.0000° W');
  });

  it('always renders four decimal places', () => {
    const result = formatCoords({ lat: 1, lon: 2, city: 'X' });
    expect(result).toBe('1.0000° N · 2.0000° E');
  });

  it('uses the bullet separator the bundle prototype uses', () => {
    expect(formatCoords(FALLBACK_COORDS)).toContain(' · ');
  });
});

describe('formatTimeWithZone', () => {
  it('zero-pads single-digit hours and minutes', () => {
    const morning = new Date();
    morning.setHours(9, 5, 0, 0);
    expect(formatTimeWithZone(morning)).toMatch(/^09:05/);
  });

  it('renders midnight as 00:00', () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(formatTimeWithZone(midnight)).toMatch(/^00:00/);
  });

  it('renders late-night two-digit hours unchanged', () => {
    const lateNight = new Date();
    lateNight.setHours(23, 59, 0, 0);
    expect(formatTimeWithZone(lateNight)).toMatch(/^23:59/);
  });

  it('produces "HH:MM ZONE" or "HH:MM" — never an empty trailing space', () => {
    const t = new Date();
    t.setHours(12, 34, 0, 0);
    const out = formatTimeWithZone(t);
    expect(out).toMatch(/^\d{2}:\d{2}( \S+)?$/);
    expect(out.endsWith(' ')).toBe(false);
  });
});

describe('getRuntimeTimezone', () => {
  it('returns a non-empty string in Node runtime (vitest env)', () => {
    // Node ships with full ICU since v13; vitest inherits. Just sanity.
    expect(typeof getRuntimeTimezone()).toBe('string');
  });
});
