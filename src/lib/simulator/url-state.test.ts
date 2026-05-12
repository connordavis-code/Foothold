import { describe, it, expect } from 'vitest';
import {
  parseView,
  parseRange,
  parseScenario,
  defaultView,
  buildSimulatorUrl,
} from './url-state';

describe('parseView', () => {
  it('returns the value when valid', () => {
    expect(parseView('empty')).toBe('empty');
    expect(parseView('moves')).toBe('moves');
    expect(parseView('comparison')).toBe('comparison');
  });

  it('returns null for invalid input', () => {
    expect(parseView('something')).toBeNull();
    expect(parseView(undefined)).toBeNull();
    expect(parseView('')).toBeNull();
  });
});

describe('parseRange', () => {
  it('returns the value when valid', () => {
    expect(parseRange('1Y')).toBe('1Y');
    expect(parseRange('2Y')).toBe('2Y');
  });

  it('returns null for invalid input', () => {
    expect(parseRange('3Y')).toBeNull();
    expect(parseRange(undefined)).toBeNull();
    expect(parseRange('1y')).toBeNull(); // case-sensitive
  });
});

describe('parseScenario', () => {
  const scenarios = [
    { id: 'a', name: 'A', overrides: {} },
    { id: 'b', name: 'B', overrides: {} },
  ] as const;

  it('returns matching scenario id', () => {
    expect(parseScenario('a', scenarios as never)).toBe('a');
  });

  it('returns null for unknown id', () => {
    expect(parseScenario('missing', scenarios as never)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseScenario(undefined, scenarios as never)).toBeNull();
  });
});

describe('defaultView', () => {
  it("returns 'empty' when scenarios list is empty AND no initial scenario", () => {
    expect(defaultView([], null)).toBe('empty');
  });

  it("returns 'comparison' when scenarios exist", () => {
    expect(defaultView([{ id: 'a' }] as never, null)).toBe('comparison');
  });

  it("returns 'comparison' when an initial scenario is selected", () => {
    expect(defaultView([], { id: 'x' } as never)).toBe('comparison');
  });
});

describe('buildSimulatorUrl', () => {
  it('builds with all params', () => {
    expect(
      buildSimulatorUrl({ view: 'comparison', range: '1Y', scenarioId: 'abc' })
    ).toBe('/simulator?view=comparison&range=1Y&scenario=abc');
  });

  it('omits scenario when null', () => {
    expect(
      buildSimulatorUrl({ view: 'empty', range: '1Y', scenarioId: null })
    ).toBe('/simulator?view=empty&range=1Y');
  });

  it('builds for compare-tab targeting', () => {
    expect(
      buildSimulatorUrl({ view: 'moves', range: '2Y', scenarioId: null })
    ).toBe('/simulator?view=moves&range=2Y');
  });
});
