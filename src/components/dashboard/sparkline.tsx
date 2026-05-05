type Props = {
  values: number[];
  /** Tailwind/CSS color for the path stroke. */
  stroke?: string;
  height?: number;
  width?: number;
  /** Soft fill below the line, same hue as stroke. Set to null to disable. */
  fillOpacity?: number;
};

/**
 * Minimal SVG sparkline — no chart-lib dependency. Cheap (a single
 * <path>), responsive via `width="100%"`, and avoids recharts'
 * ResponsiveContainer measurement hop on first paint. Renders nothing
 * for fewer than 2 points.
 */
export function Sparkline({
  values,
  stroke = 'currentColor',
  height = 56,
  width = 240,
  fillOpacity = 0.18,
}: Props) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      // Inverted Y because SVG origin is top-left.
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const linePath = `M ${points.replaceAll(' ', ' L ')}`;
  const fillPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
      className="overflow-visible"
    >
      {fillOpacity > 0 && (
        <path
          d={fillPath}
          fill={stroke}
          fillOpacity={fillOpacity}
        />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
