'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface RailSection {
  id: string;
  label: string;
}

interface Props {
  sections: ReadonlyArray<RailSection>;
}

export function SettingsRail({ sections }: Props) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observers: IntersectionObserver[] = [];
    const visible = new Map<string, number>();

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (!el) continue;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visible.set(section.id, entry.intersectionRatio);
          }
          // Pick the section with the highest visibility ratio.
          let bestId = activeId;
          let bestRatio = 0;
          for (const [id, ratio] of visible.entries()) {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestId = id;
            }
          }
          if (bestRatio > 0) setActiveId(bestId);
        },
        { rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => {
      for (const o of observers) o.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  return (
    <nav className="hidden md:block sticky top-20 self-start w-[220px] shrink-0">
      <ul className="divide-y divide-[color:var(--hairline)] border-y border-[color:var(--hairline)]">
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 text-sm',
                  'transition-colors duration-150',
                  isActive
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-current={isActive ? 'true' : undefined}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                    'transition-all duration-200',
                    isActive
                      ? 'bg-accent scale-100 opacity-100'
                      : 'bg-transparent scale-50 opacity-0',
                  )}
                />
                <span>{section.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
