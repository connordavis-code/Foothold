/**
 * Group date-bearing rows into ordered sections for the mobile
 * `<MobileList>` primitive. Insertion-order is preserved so callers
 * control sort — the underlying queries already return desc. Pure
 * predicate; lives outside the .tsx so vitest can test without a
 * JSX transform plugin.
 */
export type DateSection<T> = { dateKey: string; items: T[] };

export function groupByDate<T>(
  rows: T[],
  pickDate: (r: T) => string,
): DateSection<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = pickDate(row);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(row);
  }
  return Array.from(map, ([dateKey, items]) => ({ dateKey, items }));
}
