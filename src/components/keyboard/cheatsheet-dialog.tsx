'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { KEYBOARD_BINDINGS } from './bindings';

/**
 * Globally-mounted Dialog that opens on `?` and lists every keyboard
 * binding in the app. The `shouldIgnore` predicate matches the one in
 * operator-shell.tsx — `?` typed in an input/textarea/select/contentEditable
 * field is left alone.
 *
 * Radix Dialog handles Esc-to-close, focus trap, scroll lock, and
 * `prefers-reduced-motion` for the open/close animation.
 */
export function CheatsheetDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function shouldIgnore(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        t.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== '?') return;
      if (shouldIgnore(e)) return;
      // ⌘? / Ctrl+? are reserved for browser/OS chords (Help on macOS).
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      setOpen((v) => !v);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <KeyPill>?</KeyPill> any time to open or close this list.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {KEYBOARD_BINDINGS.map((group) => (
            <section key={group.scope} className="space-y-2">
              <h3 className="text-eyebrow">{group.scope}</h3>
              <ul className="space-y-1.5">
                {group.bindings.map((b) => (
                  <li
                    key={`${group.scope}-${b.action}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-foreground/90">{b.action}</span>
                    <span className="flex items-center gap-1">
                      {b.keys.map((k, i) => (
                        <span
                          key={k}
                          className="flex items-center gap-1"
                        >
                          {i > 0 && (
                            <span className="text-xs text-muted-foreground">
                              or
                            </span>
                          )}
                          <KeyPill>{k}</KeyPill>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KeyPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80',
        className,
      )}
    >
      {children}
    </span>
  );
}
