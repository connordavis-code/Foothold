'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { FootholdMark } from '@/components/brand/foothold-mark';
import { cn } from '@/lib/utils';

// R.1 T6 sidebar brand. Wraps the FootholdMark (simplified mode) with
// a lowercase "foothold" wordmark. Click triggers a 600ms pulse on the
// mark — the sidebar's only signature animation, signalling that the
// app is alive without being noisy.
//
// Client component because the pulse is a class-toggle one-shot:
// CSS :active only fires while click is held; we want a 600ms loop
// that runs once independently of click duration.
export function SidebarBrand() {
  const [pulsing, setPulsing] = useState(false);

  const handleClick = useCallback(() => {
    setPulsing(true);
    // Match the duration of @keyframes sb-brand-pulse in globals.css.
    setTimeout(() => setPulsing(false), 600);
  }, []);

  return (
    <Link
      href="/dashboard"
      onClick={handleClick}
      className={cn(
        'sb-brand flex items-center gap-2.5 px-5 py-5 border-b border-[var(--hairline)] text-[color:var(--text)]',
        pulsing && 'sb-brand-pulse',
      )}
    >
      <FootholdMark size={40} simplified />
      <span className="font-mono text-base lowercase tracking-tight">
        foothold
      </span>
    </Link>
  );
}
