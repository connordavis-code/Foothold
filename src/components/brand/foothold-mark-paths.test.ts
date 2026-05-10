import { describe, expect, it } from 'vitest';
import {
  ASPECT,
  HERO_DOT,
  HERO_PATHS,
  HERO_VIEWBOX,
  SIMPLIFIED_DOT,
  SIMPLIFIED_PATHS,
  SIMPLIFIED_VIEWBOX,
} from './foothold-mark-paths';

describe('FootholdMark — shared geometry', () => {
  it('uses a single outer aspect for both render modes', () => {
    // The bundle's `const w = (size * 128) / 104` runs once, outside
    // the simplified branch. Preserving that means the brand footprint
    // stays the same shape at every size, regardless of mode.
    expect(ASPECT).toBeCloseTo(128 / 104);
  });
});

describe('FootholdMark — hero geometry (default mode)', () => {
  it('renders 5 contour paths', () => {
    expect(HERO_PATHS).toHaveLength(5);
  });

  it('encodes a symmetric faded-edges / full-middle opacity envelope', () => {
    expect(HERO_PATHS.map((p) => p.opacity)).toEqual([0.4, 0.7, 0.95, 0.7, 0.4]);
  });

  it('makes the middle line the heaviest stroke', () => {
    const middle = HERO_PATHS[2].strokeWidth;
    expect(middle).toBeGreaterThan(HERO_PATHS[0].strokeWidth);
    expect(middle).toBeGreaterThan(HERO_PATHS[4].strokeWidth);
  });

  it('positions the dot just above the middle contour', () => {
    expect(HERO_DOT).toEqual({ cx: 2, cy: -6, r: 4.5 });
  });

  it('uses a 128×104 viewBox centered on origin', () => {
    expect(HERO_VIEWBOX).toEqual({ x: -64, y: -52, w: 128, h: 104 });
  });
});

describe('FootholdMark — simplified geometry (sidebar mode)', () => {
  it('renders 3 contour paths', () => {
    expect(SIMPLIFIED_PATHS).toHaveLength(3);
  });

  it('keeps the middle line full-opacity, fades the edges symmetrically', () => {
    expect(SIMPLIFIED_PATHS.map((p) => p.opacity)).toEqual([0.55, 1, 0.55]);
  });

  it('uses thicker strokes than hero mode for sidebar visibility', () => {
    const minSimplified = Math.min(...SIMPLIFIED_PATHS.map((p) => p.strokeWidth));
    const maxHero = Math.max(...HERO_PATHS.map((p) => p.strokeWidth));
    expect(minSimplified).toBeGreaterThan(maxHero);
  });

  it('positions the dot at the dedicated 3-line offset', () => {
    expect(SIMPLIFIED_DOT).toEqual({ cx: 2, cy: -4, r: 5 });
  });

  it('uses a 128×64 viewBox (narrower than the outer aspect, so content centers vertically)', () => {
    expect(SIMPLIFIED_VIEWBOX).toEqual({ x: -64, y: -32, w: 128, h: 64 });
    const innerAspect = SIMPLIFIED_VIEWBOX.w / SIMPLIFIED_VIEWBOX.h;
    expect(innerAspect).toBeGreaterThan(ASPECT);
  });
});
