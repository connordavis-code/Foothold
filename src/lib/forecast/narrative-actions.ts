'use server';

import { and, desc, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  forecastNarratives,
  scenarios,
  type ForecastNarrative,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { generateForecastNarrative as callLLM } from '@/lib/anthropic/forecast-narrative';
import { buildForecastPrompt } from '@/lib/anthropic/forecast-prompt';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { projectCash } from '@/lib/forecast/engine';
import {
  buildInputHash,
  computeHistoryFingerprint,
  fetchFingerprintInputs,
} from './history-fingerprint';
import type { ScenarioOverrides } from './types';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type CachedNarrative = {
  narrative: string;
  generatedAt: Date;
  isStale: boolean;
};

// Cache-only read used on mount to avoid an LLM call on first paint.
// Returns null when no cached narrative exists for the current input hash.
export async function lookupForecastNarrative(rawInput: unknown): Promise<
  ActionResult<{ narrative: string; generatedAt: Date } | null>
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = parseLookupInput(rawInput);
  if (!parsed.ok) return parsed;

  try {
    const owned = await isScenarioOwnedByUser(parsed.value.scenarioId, session.user.id);
    if (!owned) return { ok: false, error: 'Scenario not found' };

    const fingerprintInputs = await fetchFingerprintInputs(session.user.id);
    const fingerprint = computeHistoryFingerprint(fingerprintInputs);
    const inputHash = buildInputHash(parsed.value.overrides, fingerprint);

    const row = await fetchCacheRow(parsed.value.scenarioId, inputHash);
    if (!row) return { ok: true, data: null };

    return {
      ok: true,
      data: { narrative: row.narrative, generatedAt: row.generatedAt },
    };
  } catch (err) {
    await logError('forecast.narrative.lookup', err);
    return { ok: false, error: 'Could not look up narrative' };
  }
}

// Cache-first then LLM. On LLM failure, falls back to the most recent
// cached entry (isStale: true) so the UI always has something to show.
export async function generateForecastNarrativeAction(
  rawInput: unknown,
): Promise<ActionResult<CachedNarrative>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = parseGenerateInput(rawInput);
  if (!parsed.ok) return parsed;

  const { scenarioId, overrides, force } = parsed.value;

  try {
    const owned = await isScenarioOwnedByUser(scenarioId, session.user.id);
    if (!owned) return { ok: false, error: 'Scenario not found' };

    const fingerprintInputs = await fetchFingerprintInputs(session.user.id);
    const fingerprint = computeHistoryFingerprint(fingerprintInputs);
    const inputHash = buildInputHash(overrides, fingerprint);

    if (!force) {
      const cached = await fetchCacheRow(scenarioId, inputHash);
      if (cached) {
        return {
          ok: true,
          data: {
            narrative: cached.narrative,
            generatedAt: cached.generatedAt,
            isStale: false,
          },
        };
      }
    }

    const history = await getForecastHistory(session.user.id);
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const baseline = projectCash({ history, overrides: {}, currentMonth });
    const scenario = projectCash({ history, overrides, currentMonth });

    const promptContent = buildForecastPrompt({
      history,
      overrides,
      baselineProjection: baseline.projection,
      scenarioProjection: scenario.projection,
      goalImpacts: scenario.goalImpacts,
    });

    let narrativeText: string;
    try {
      const result = await callLLM(promptContent);
      narrativeText = result.text;
    } catch (err) {
      await logError('forecast.narrative.generate', err, { scenarioId });
      const fallback = await fetchLatestCacheRow(scenarioId);
      if (fallback) {
        return {
          ok: true,
          data: {
            narrative: fallback.narrative,
            generatedAt: fallback.generatedAt,
            isStale: true,
          },
        };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'AI summary failed',
      };
    }

    // Upsert: conflict on (scenarioId, inputHash) updates the text and timestamp.
    // Using lookup-then-update because Drizzle's onConflictDoUpdate target
    // requires a single-column or constraint name, not an arbitrary column tuple.
    const existing = await fetchCacheRow(scenarioId, inputHash);
    if (existing) {
      await db
        .update(forecastNarratives)
        .set({ narrative: narrativeText, generatedAt: new Date() })
        .where(eq(forecastNarratives.id, existing.id));
    } else {
      await db.insert(forecastNarratives).values({
        userId: session.user.id,
        scenarioId,
        inputHash,
        narrative: narrativeText,
      });
    }

    return {
      ok: true,
      data: {
        narrative: narrativeText,
        generatedAt: new Date(),
        isStale: false,
      },
    };
  } catch (err) {
    await logError('forecast.narrative.generate', err, { scenarioId });
    return { ok: false, error: 'Could not generate narrative' };
  }
}

// --- helpers ---

async function isScenarioOwnedByUser(
  scenarioId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function fetchCacheRow(
  scenarioId: string,
  inputHash: string,
): Promise<ForecastNarrative | null> {
  const rows = await db
    .select()
    .from(forecastNarratives)
    .where(
      and(
        eq(forecastNarratives.scenarioId, scenarioId),
        eq(forecastNarratives.inputHash, inputHash),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function fetchLatestCacheRow(
  scenarioId: string,
): Promise<ForecastNarrative | null> {
  const rows = await db
    .select()
    .from(forecastNarratives)
    .where(eq(forecastNarratives.scenarioId, scenarioId))
    .orderBy(desc(forecastNarratives.generatedAt))
    .limit(1);
  return rows[0] ?? null;
}

// Hand-rolled validation rather than zod — overrides shape is too dynamic
// for a meaningful zod schema; the engine will fail loudly on truly malformed input.
function parseLookupInput(
  raw: unknown,
):
  | { ok: true; value: { scenarioId: string; overrides: ScenarioOverrides } }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid input' };
  const input = raw as { scenarioId?: unknown; overrides?: unknown };
  if (typeof input.scenarioId !== 'string' || !input.scenarioId) {
    return { ok: false, error: 'Missing scenarioId' };
  }
  if (!input.overrides || typeof input.overrides !== 'object') {
    return { ok: false, error: 'Missing overrides' };
  }
  return {
    ok: true,
    value: {
      scenarioId: input.scenarioId,
      overrides: input.overrides as ScenarioOverrides,
    },
  };
}

// Extends parseLookupInput with optional force flag.
function parseGenerateInput(
  raw: unknown,
):
  | {
      ok: true;
      value: {
        scenarioId: string;
        overrides: ScenarioOverrides;
        force: boolean;
      };
    }
  | { ok: false; error: string } {
  const lookup = parseLookupInput(raw);
  if (!lookup.ok) return lookup;
  const force = (raw as { force?: unknown }).force === true;
  return { ok: true, value: { ...lookup.value, force } };
}
