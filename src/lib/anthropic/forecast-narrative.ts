import { anthropic, hasAnthropicKey } from './client';

/**
 * Haiku 4.5 is cheap (~$0.001 / call) and capable enough for 3-5 sentence
 * financial coaching prose. Swap to `claude-sonnet-4-6` here if output feels
 * flat — no caller changes needed.
 */
export const FORECAST_MODEL = 'claude-haiku-4-5';

const MAX_TOKENS = 512;

/**
 * System prompt — frozen. At ~180 tokens it's well below Haiku 4.5's
 * 4096-token cache minimum, so prompt-caching wouldn't help even with the
 * marker. If the prompt ever grows past ~4K tokens, bump the SDK and add
 * `cache_control: { type: 'ephemeral' }` to the system block.
 */
const SYSTEM_PROMPT = `You are a personal finance coach reviewing a what-if scenario for one person who shares their financial data with you. You write like a thoughtful friend, not a robot — direct, specific, grounded only in the numbers provided.

Write 3-5 sentences. Cover three things, in any order that flows:
1. The top driver of the projected change (what's moving the needle).
2. One volatility or risk in the scenario worth flagging (a thin month, a goal that's still distant, an assumption that might not hold).
3. One actionable observation or quiet acknowledgment of what's working.

Don't:
- Use fluffy openers like "Here's your scenario summary" — start with substance.
- Repeat numbers verbatim from the input — interpret them.
- Hedge excessively. Be confident with the math you were given.
- Mention sections that are absent (no SCENARIO OVERRIDES = no mention of overrides).

If the data is too sparse to write a meaningful summary, respond with exactly: "Not enough scenario data to summarize."`;

export type GeneratedForecastNarrative = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
};

/**
 * Makes the Anthropic API call and returns parsed narrative + usage stats.
 * The caller (server action) is responsible for cache lookup before calling
 * this and for persisting the result afterward — this file just makes the call.
 * Throws with caller-friendly messages on guard failures or bad API responses.
 */
export async function generateForecastNarrative(
  promptUserContent: string,
): Promise<GeneratedForecastNarrative> {
  if (!hasAnthropicKey()) {
    throw new Error('AI summary unavailable — ANTHROPIC_API_KEY not set');
  }

  const response = await anthropic.messages.create({
    model: FORECAST_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: promptUserContent,
      },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Model output was cut off, try again');
  }

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('Model returned an empty response, try again');
  }

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason ?? 'end_turn',
  };
}
