'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FALLBACK_COORDS,
  formatCoords,
  formatTimeWithZone,
  getRuntimeTimezone,
  resolveCoordsForZone,
} from './signature-footer-data';

// R.1 source-count placeholder — R.2 wires real getSourceHealth() count
// alongside the dashboard trust strip, per locked R.1 decision.
const SOURCE_COUNT_PLACEHOLDER = 3;

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'v0.1';

// Cartographic-line footer below page content on every (app) route.
// Live time updates every 30s (cache-cheap relative to user attention).
// Coords derive from the browser's IANA timezone via a static lookup —
// no network, no server geo, no PII upstream (locked R.1 decision).
export function SignatureFooter() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // First tick happens on mount (client-only) so SSR renders a
    // placeholder, avoiding a hydration mismatch on the timestamp.
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Resolve coords once per mount — IANA zone doesn't change without
  // a full reload. Memo keeps the lookup off the 30s tick path.
  const coordsLine = useMemo(() => {
    const zone = getRuntimeTimezone();
    const coords = zone ? resolveCoordsForZone(zone) : FALLBACK_COORDS;
    return formatCoords(coords);
  }, []);

  const timeLine = now ? formatTimeWithZone(now) : '——:——';

  return (
    <footer className="sig-footer">
      <div className="sig-left">
        <span className="sig-status">
          <span className="sig-dot" aria-hidden="true" /> connected
        </span>
        <span className="sig-sep" aria-hidden="true">·</span>
        <span>{SOURCE_COUNT_PLACEHOLDER} sources</span>
      </div>
      <div className="sig-right">
        <span>{coordsLine}</span>
        <span className="sig-sep" aria-hidden="true">·</span>
        <span>synced {timeLine}</span>
        <span className="sig-sep" aria-hidden="true">·</span>
        <span>{APP_VERSION}</span>
      </div>
    </footer>
  );
}
