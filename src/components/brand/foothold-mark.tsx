import {
  ASPECT,
  HERO_DOT,
  HERO_PATHS,
  HERO_VIEWBOX,
  SIMPLIFIED_DOT,
  SIMPLIFIED_PATHS,
  SIMPLIFIED_VIEWBOX,
} from './foothold-mark-paths';

interface FootholdMarkProps {
  /** Render height in px. Width derives from the shared outer aspect. */
  size?: number;
  /** Three-line variant for sidebar/brand-tile scale. */
  simplified?: boolean;
  /** Show the position dot. */
  withDot?: boolean;
  /** Override the dot color. Defaults to var(--accent). */
  dotColor?: string;
  /** Override the contour stroke color. Defaults to currentColor so the
   *  mark adapts to its parent's text color (e.g., white on the hero card,
   *  warm-graphite on a paper card). */
  strokeColor?: string;
  className?: string;
}

// Pure-SVG server component. Geometry constants live in
// foothold-mark-paths.ts so they can be tested without DOM rendering.
export function FootholdMark({
  size = 22,
  simplified = false,
  withDot = true,
  dotColor = 'var(--accent)',
  strokeColor = 'currentColor',
  className,
}: FootholdMarkProps) {
  const paths = simplified ? SIMPLIFIED_PATHS : HERO_PATHS;
  const dot = simplified ? SIMPLIFIED_DOT : HERO_DOT;
  const viewBox = simplified ? SIMPLIFIED_VIEWBOX : HERO_VIEWBOX;
  const width = size * ASPECT;

  return (
    <svg
      className={className}
      width={width}
      height={size}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      role="img"
      aria-label="Foothold"
      shapeRendering="geometricPrecision"
      style={{ display: 'block' }}
    >
      <g strokeLinecap="round" fill="none" stroke={strokeColor}>
        {paths.map((p, i) => (
          <path key={i} d={p.d} strokeWidth={p.strokeWidth} opacity={p.opacity} />
        ))}
      </g>
      {withDot && <circle cx={dot.cx} cy={dot.cy} r={dot.r} fill={dotColor} />}
    </svg>
  );
}
