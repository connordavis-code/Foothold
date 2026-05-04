import Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { hasAnthropicKey } from '@/lib/anthropic/client';
import { INSIGHT_MODEL, generateNarrative } from '@/lib/anthropic/insights';
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
 * Generate (or regenerate) the weekly insight for `userId` and upsert
 * into the insight table. Pure: no auth check, no cache invalidation —
 * those belong to the caller (server action revalidates; cron does not).
 *
 * Throws caller-friendly Error messages so the action can render them
 * inline and the cron handler can log them with their original message.
 */
export async function generateInsightForUser(
  userId: string,
): Promise<GenerateInsightResult> {
  if (!hasAnthropicKey()) {
    throw new Error('Set ANTHROPIC_API_KEY in .env.local to generate insights');
  }

  const weekKey = yesterdayKey();
  const snapshot = await collectSnapshot(userId, weekKey);

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
      userId,
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

  return {
    weekStart: snapshot.weekStart,
    weekEnd: snapshot.weekEnd,
    generatedAt: generatedAt.toISOString(),
  };
}
