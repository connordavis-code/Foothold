/**
 * Pure helpers for editing override arrays inside ScenarioOverrides.
 * Every helper:
 *   - Returns a NEW array/value (no mutation)
 *   - Treats `undefined` input as "no items yet"
 *   - Returns `undefined` (not an empty array) when removing the last item,
 *     so the override key gets stripped from the JSON payload entirely
 *
 * Used by the per-override-type editor components in
 * src/components/simulator/*-overrides.tsx.
 */

export function addItem<T>(arr: T[] | undefined, item: T): T[] {
  return [...(arr ?? []), item];
}

export function removeItem<T>(
  arr: T[] | undefined,
  match: (item: T) => boolean,
): T[] | undefined {
  if (!arr) return undefined;
  const next = arr.filter((i) => !match(i));
  if (next.length === 0) return undefined;
  return next;
}

export function updateItem<T>(
  arr: T[] | undefined,
  match: (item: T) => boolean,
  patch: Partial<T>,
): T[] | undefined {
  if (!arr) return undefined;
  return arr.map((i) => (match(i) ? { ...i, ...patch } : i));
}

export function setSingle<T>(value: T): T {
  return value;
}

export function clearSingle<T>(): T | undefined {
  return undefined;
}
