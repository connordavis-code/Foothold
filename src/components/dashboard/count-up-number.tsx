'use client';

import { useEffect, useState } from 'react';

type Props = { target: number };

/**
 * One-time count-up on first paint. Eases out over 900ms.
 * Honors prefers-reduced-motion (renders target immediately).
 */
export function CountUpNumber({ target }: Props) {
  const [n, setN] = useState(() => {
    if (typeof window === 'undefined') return target;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduced ? target : target * 0.985;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setN(target);
      return;
    }
    let raf: number;
    const start = performance.now();
    const dur = 900;
    const from = target * 0.985;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(from + (target - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs).toLocaleString();
  const cents = Math.round((abs % 1) * 100)
    .toString()
    .padStart(2, '0');
  return (
    <>
      {sign}${whole}
      <span className="text-[--text-2]">.{cents}</span>
    </>
  );
}
