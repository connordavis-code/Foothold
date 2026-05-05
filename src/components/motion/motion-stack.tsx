'use client';

import { Children } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

type Props = {
  children: React.ReactNode;
  /** Tailwind spacing class for the gap between children. */
  className?: string;
  /** Initial Y offset of each child in pixels. */
  rise?: number;
  /** Stagger between children in seconds. */
  stagger?: number;
};

const containerVariants = (stagger: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

const itemVariants = (rise: number): Variants => ({
  hidden: { opacity: 0, y: rise },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      // ease-out-quart per spec §5.6 — exponential, no bounce
      ease: [0.25, 1, 0.5, 1],
    },
  },
});

/**
 * Reveal-on-mount stack with subtle stagger. Each direct child fades +
 * rises into place, 30ms between children by default. Respects
 * prefers-reduced-motion: when set, the variants collapse to instant
 * appearance (opacity 1 from the start, no transform).
 *
 * Wraps server children — the parent (a server page) renders the cards,
 * we just animate them in. Doesn't replace the children's own state.
 */
export function MotionStack({
  children,
  className,
  rise = 8,
  stagger = 0.03,
}: Props) {
  const reduced = useReducedMotion();
  const items = Children.toArray(children);

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={containerVariants(stagger)}
    >
      {items.map((child, i) => (
        <motion.div key={i} variants={itemVariants(rise)}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
