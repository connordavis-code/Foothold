'use server';

import Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { hasAnthropicKey } from '@/lib/anthropic/client';
import {
  INSIGHT_MODEL,
  generateNarrative,
} from '@/lib/anthropic/insights';
import { db } from '@/lib/db';
import { collectSnapshot } from '@/lib/db/queries/insights-data';
import { insights } from '@/lib/db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Yesterday in YYYY-MM-DD (server clock, UTC). Plaid txns for today may
 * still be incomplete, so we anchor the window one day back. */
function yesterdayKey(): string {
  return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
}

export type GenerateInsightResult = {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
};

/**
 * Generate (or regenerate) the weekly insight for the current week and
 * upsert into the insight table. Always overwrites — pages read the cache,
 * but the button always pays for a fresh AI call. Returns enough info for
 * the client to render the cache timestamp.
 *
 * Throws caller-friendly Error messages on failure; the GenerateButton
 * component catches and shows them inline.
 */
export async function generateInsightAction(): Promise<GenerateInsightResult> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  if (!hasAnthropicKey()) {
    throw new Error('Set ANTHROPIC_API_KEY in .env.local to generate insights');
  }

  const weekKey = yesterdayKey();
  const snapshot = await collectSnapshot(session.user.id, weekKey);

  // Privacy-boundary log: dump the JSON we're about to send. Easy to
  // verify in dev that nothing PII-shaped slipped in. Toggle off later.
  console.info('[insights] snapshot:', JSON.stringify(snapshot));

  if (snapshot.isEmpty) {
    throw new Error('Not enough data this week to summarize');
  }

  let narrative;
  try {
    narrative = await generateNarrative(snapshot);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error('Invalid Anthropic API key');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error('Rate limit, try again in a minute');
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error('Anthropic is unavailable, try again in a minute');
    }
    throw err;
  }

  const generatedAt = new Date();

  await db
    .insert(insights)
    .values({
      userId: session.user.id,
      weekStart: snapshot.weekStart,
      weekEnd: snapshot.weekEnd,
      narrative: narrative.text,
      model: INSIGHT_MODEL,
      inputTokens: narrative.inputTokens,
      outputTokens: narrative.outputTokens,
      generatedAt,
    })
    .onConflictDoUpdate({
      target: [insights.userId, insights.weekStart],
      set: {
        weekEnd: sql`excluded.week_end`,
        narrative: sql`excluded.narrative`,
        model: sql`excluded.model`,
        inputTokens: sql`excluded.input_tokens`,
        outputTokens: sql`excluded.output_tokens`,
        generatedAt: sql`excluded.generated_at`,
        updatedAt: new Date(),
      },
    });

  revalidatePath('/insights');

  return {
    weekStart: snapshot.weekStart,
    weekEnd: snapshot.weekEnd,
    generatedAt: generatedAt.toISOString(),
  };
}
