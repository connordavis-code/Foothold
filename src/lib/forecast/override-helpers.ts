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

/**
 * Index-based variant of removeItem. Useful when the array can have items
 * that are equivalent by predicate but distinct by position (e.g., a list
 * of recurring stream changes where two entries pause the same stream in
 * different month ranges).
 */
export function removeItemAt<T>(
  arr: T[] | undefined,
  index: number,
): T[] | undefined {
  if (!arr) return undefined;
  if (index < 0 || index >= arr.length) return arr;
  const next = arr.filter((_, i) => i !== index);
  if (next.length === 0) return undefined;
  return next;
}

/**
 * Index-based variant of updateItem. Same use case as removeItemAt.
 */
export function updateItemAt<T>(
  arr: T[] | undefined,
  index: number,
  patch: Partial<T>,
): T[] | undefined {
  if (!arr) return undefined;
  if (index < 0 || index >= arr.length) return arr;
  return arr.map((item, i) => (i === index ? { ...item, ...patch } : item));
}
