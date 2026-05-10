// R.1 redesign brand mark — terrain contour geometry. Extracted from
// claude-design-context/foothold-shared.jsx so the constants are
// testable; the component (foothold-mark.tsx) is a thin SVG renderer.

export type ContourPath = {
  readonly d: string;
  readonly strokeWidth: number;
  readonly opacity: number;
};

export type DotConfig = {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
};

export type ViewBox = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

// Bundle preserves a single outer aspect (128/104) for both render modes
// so the brand footprint stays consistent at any size. Simplified mode's
// inner viewBox is narrower (128×64), so its content centers vertically
// in the outer box. Source: foothold-shared.jsx line 10 (`const w = ...`
// computed once, outside the simplified branch).
export const ASPECT = 128 / 104;

// Hero mode: 5 contour lines with a symmetric faded-edges / full-middle
// opacity envelope. Used at brand-prominent scales (hero card, empty
// states). Dot sits just above the heaviest middle contour.
export const HERO_PATHS: readonly ContourPath[] = [
  { d: 'M -54 -40 Q -28 -52, -2 -44 Q 22 -38, 54 -42', strokeWidth: 1.6, opacity: 0.4 },
  { d: 'M -56 -22 Q -28 -34, 0 -26 Q 26 -20, 56 -24', strokeWidth: 1.6, opacity: 0.7 },
  { d: 'M -58 -2 Q -28 -16, 2 -6 Q 28 0, 58 -4',     strokeWidth: 1.9, opacity: 0.95 },
  { d: 'M -56 18 Q -28 6, 0 14 Q 26 20, 56 16',       strokeWidth: 1.6, opacity: 0.7 },
  { d: 'M -52 36 Q -26 26, 2 32 Q 24 38, 52 34',      strokeWidth: 1.6, opacity: 0.4 },
] as const;

export const HERO_DOT: DotConfig = { cx: 2, cy: -6, r: 4.5 };
export const HERO_VIEWBOX: ViewBox = { x: -64, y: -52, w: 128, h: 104 };

// Simplified mode: 3 contour lines with thicker strokes for clarity at
// sidebar/brand-tile scale. Middle line full-opacity to anchor the eye.
export const SIMPLIFIED_PATHS: readonly ContourPath[] = [
  { d: 'M -54 -22 Q -28 -32, 0 -26 Q 26 -20, 54 -24', strokeWidth: 3,   opacity: 0.55 },
  { d: 'M -56 0 Q -28 -12, 2 -4 Q 28 4, 56 0',         strokeWidth: 3.4, opacity: 1 },
  { d: 'M -54 22 Q -28 12, 2 18 Q 26 24, 54 20',       strokeWidth: 3,   opacity: 0.55 },
] as const;

export const SIMPLIFIED_DOT: DotConfig = { cx: 2, cy: -4, r: 5 };
export const SIMPLIFIED_VIEWBOX: ViewBox = { x: -64, y: -32, w: 128, h: 64 };
