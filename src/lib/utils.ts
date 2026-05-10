import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with clsx + tailwind-merge.
 * Used by every shadcn/ui component.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a USD amount. Negative values render with a minus sign.
 * 1234.56 → "$1,234.56"
 */
export function formatCurrency(
  amount: number,
  options: { signed?: boolean; compact?: boolean } = {},
) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: options.compact ? 'compact' : 'standard',
    signDisplay: options.signed ? 'always' : 'auto',
  });
  return formatter.format(amount);
}

/**
 * Currency formatter for narrative prose. Drops trailing zero cents on
 * whole-dollar amounts ($50, not $50.00) but preserves cents otherwise
 * ($50.32). Use ONLY in inline prose where reading flow matters more than
 * column alignment. For tables / cards / numeric grids use formatCurrency
 * so values right-align at the cent column.
 */
export function formatCurrencyCompact(amount: number): string {
  const isWhole = Number.isInteger(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a percentage with 1 decimal.
 * 0.0734 → "7.3%"
 */
export function formatPercent(value: number, decimals = 1) {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
