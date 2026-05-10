/* global React */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ============================================================
// Foothold mark — terrain contour, with optional position dot
// ============================================================
function FootholdMark({ size = 22, dotColor, strokeColor, withDot = true, simplified, className = '' }) {
  const stroke = strokeColor || 'var(--text)';
  const dot = dotColor || 'var(--accent)';
  const w = (size * 128) / 104;
  // Simplified mode: just 3 curved contour lines + dot. Sized for clarity at
  // sidebar/brand scale without being as visually busy as the full 5-line mark.
  if (simplified) {
    const vbW = 128, vbH = 64;
    return (
      <svg className={className} width={w} height={size} viewBox={`-64 -32 ${vbW} ${vbH}`}
        role="img" aria-label="Foothold" style={{ display: 'block' }}
        shapeRendering="geometricPrecision">
        <g strokeLinecap="round" fill="none" stroke={stroke}>
          <path d="M -54 -22 Q -28 -32, 0 -26 Q 26 -20, 54 -24" strokeWidth="3" opacity="0.55"/>
          <path d="M -56 0 Q -28 -12, 2 -4 Q 28 4, 56 0"        strokeWidth="3.4" opacity="1"/>
          <path d="M -54 22 Q -28 12, 2 18 Q 26 24, 54 20"      strokeWidth="3" opacity="0.55"/>
        </g>
        {withDot && <circle cx="2" cy="-4" r="5" fill={dot}/>}
      </svg>
    );
  }
  // Always render the wavy Bézier mark for visual consistency across sizes.
  return (
    <svg
      className={className}
      width={w} height={size}
      viewBox="-64 -52 128 104"
      role="img" aria-label="Foothold"
      shapeRendering="geometricPrecision"
      style={{ display: 'block' }}
    >
      <g strokeLinecap="round" fill="none">
        <path d="M -54 -40 Q -28 -52, -2 -44 Q 22 -38, 54 -42" stroke={stroke} strokeWidth="1.6" opacity="0.4" />
        <path d="M -56 -22 Q -28 -34, 0 -26 Q 26 -20, 56 -24" stroke={stroke} strokeWidth="1.6" opacity="0.7" />
        <path d="M -58 -2 Q -28 -16, 2 -6 Q 28 0, 58 -4" stroke={stroke} strokeWidth="1.9" opacity="0.95" />
        <path d="M -56 18 Q -28 6, 0 14 Q 26 20, 56 16" stroke={stroke} strokeWidth="1.6" opacity="0.7" />
        <path d="M -52 36 Q -26 26, 2 32 Q 24 38, 52 34" stroke={stroke} strokeWidth="1.6" opacity="0.4" />
      </g>
      {withDot && <circle cx="2" cy="-6" r="4.5" fill={dot} />}
    </svg>
  );
}

// Topographic contour pattern — a wider field of softened lines, used as a
// watermark on hero card / empty state. Generated from a few sine paths.
function ContourBackdrop({ stroke = 'currentColor', density = 6, strokeWidth = 1, opacity = 1 }) {
  const lines = Array.from({ length: density }, (_, i) => {
    const y = (i + 1) * (100 / (density + 1));
    const phase = i * 23;
    const amp = 6 + (i % 3) * 2;
    const points = Array.from({ length: 24 }, (_, k) => {
      const x = (k / 23) * 100;
      const yy = y + Math.sin((x + phase) * 0.08) * amp + Math.sin((x + phase) * 0.18) * (amp * 0.4);
      return `${x},${yy}`;
    });
    return (
      <polyline
        key={i}
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={0.35 + (i % 2) * 0.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', opacity }}>
      {lines}
    </svg>
  );
}

// ============================================================
// Lucide-style icons (outline, 16px default)
// ============================================================
function Icon({ name, size = 16, strokeWidth = 1.6, ...rest }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    ...rest,
  };
  switch (name) {
    case 'dashboard': return (<svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>);
    case 'simulator': return (<svg {...common}><path d="M3 17 L9 11 L13 14 L21 6"/><path d="M14 6 H21 V13"/></svg>);
    case 'goals': return (<svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>);
    case 'recurring': return (<svg {...common}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 4v4h-4"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 20v-4h4"/></svg>);
    case 'transactions': return (<svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/></svg>);
    case 'investments': return (<svg {...common}><path d="M3 17 L9 11 L13 15 L21 7"/><path d="M14 7 H21 V14"/></svg>);
    case 'settings': return (<svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
    case 'search': return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>);
    case 'sun': return (<svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>);
    case 'moon': return (<svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>);
    case 'refresh': return (<svg {...common}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 4v4h-4"/></svg>);
    case 'arrow-right': return (<svg {...common}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>);
    case 'arrow-down-right': return (<svg {...common}><path d="M7 7l10 10"/><path d="M17 7v10H7"/></svg>);
    case 'alert': return (<svg {...common}><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.86a2 2 0 0 1 3.4 0l8.6 14.5a2 2 0 0 1-1.7 3H3.4a2 2 0 0 1-1.7-3l8.6-14.5z"/></svg>);
    case 'sparkles': return (<svg {...common}><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2 2M15.7 15.7l2 2M6.3 17.7l2-2M15.7 8.3l2-2"/></svg>);
    case 'calendar': return (<svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></svg>);
    case 'book': return (<svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>);
    case 'plus': return (<svg {...common}><path d="M12 5v14M5 12h14"/></svg>);
    case 'chevron-right': return (<svg {...common}><path d="m9 18 6-6-6-6"/></svg>);
    case 'chevron-down': return (<svg {...common}><path d="m6 9 6 6 6-6"/></svg>);
    case 'minus': return (<svg {...common}><path d="M5 12h14"/></svg>);
    case 'x': return (<svg {...common}><path d="M18 6 6 18M6 6l12 12"/></svg>);
    case 'wallet': return (<svg {...common}><path d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7z"/><path d="M3 7V6a2 2 0 0 1 2-2h11"/><circle cx="17" cy="13.5" r="1.2" fill="currentColor"/></svg>);
    case 'income': return (<svg {...common}><path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/></svg>);
    case 'big-buy': return (<svg {...common}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V4a4 4 0 0 1 8 0v2"/></svg>);
    case 'pause': return (<svg {...common}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>);
    case 'job-loss': return (<svg {...common}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="m9 13 6 0"/></svg>);
    case 'sub': return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>);
    case 'gift': return (<svg {...common}><rect x="3" y="8" width="18" height="4" rx="1"/><rect x="5" y="12" width="14" height="9" rx="1"/><path d="M12 8v13"/><path d="M12 8s-3-5-5-3 0 3 5 3z"/><path d="M12 8s3-5 5-3 0 3-5 3z"/></svg>);
    case 'bell': return (<svg {...common}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 9H3s3-1 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>);
    case 'flag': return (<svg {...common}><path d="M4 21V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>);
    case 'check': return (<svg {...common}><path d="m5 12 5 5L20 7"/></svg>);
    default: return null;
  }
}

// ============================================================
// Numeric formatting helpers
// ============================================================
const fmtMoney = (n, opts = {}) => {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}$${v}`;
};
const fmtCompact = (n) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}K`;
  return `${sign}$${a.toFixed(0)}`;
};
const splitMoney = (n) => {
  const v = Math.abs(n).toFixed(2);
  const [whole, cents] = v.split('.');
  const w = parseInt(whole, 10).toLocaleString('en-US');
  return { sign: n < 0 ? '-' : '', whole: w, cents };
};

// ============================================================
// Trajectory generator (deterministic, smooth)
// ============================================================
function genTrajectory({ days = 180, end = 95955.42, vol = 1500, seed = 12 }) {
  // produce values walking backwards from end with a gentle downtrend
  let rnd = seed;
  const next = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
  const out = new Array(days);
  let v = end;
  for (let i = days - 1; i >= 0; i--) {
    out[i] = v;
    const drift = -28 / days; // ends $28 below today
    const shock = (next() - 0.5) * vol;
    v = v - drift - shock * 0.4;
  }
  return out;
}

Object.assign(window, {
  FootholdMark, ContourBackdrop, Icon,
  fmtMoney, fmtCompact, splitMoney, genTrajectory,
});
