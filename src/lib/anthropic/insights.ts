import { anthropic } from './client';
import type { InsightSnapshot } from '@/lib/db/queries/insights-data';

/**
 * Model used for weekly insights. Haiku 4.5 is cheap (~$0.001 / call) and
 * plenty smart for narrative summarization. Swap to `claude-sonnet-4-6`
 * here if Haiku output ever feels flat — no other code changes needed.
 */
export const INSIGHT_MODEL = 'claude-haiku-4-5';

const MAX_TOKENS = 1024;

/**
 * System prompt — frozen. At ~250 tokens it's well below Haiku 4.5's
 * 4096-token cache minimum, so prompt-caching wouldn't help even with the
 * marker. SDK 0.32.1 also predates the `cache_control` field on
 * TextBlockParam, so adding it would also require a SDK bump. When pt2/
 * pt3 grow the system prompt past ~4K tokens, bump the SDK and add
 * `cache_control: { type: 'ephemeral' }` to the system block.
 */
const SYSTEM_PROMPT = `You are a personal finance analyst writing a weekly check-in for one person who shares their financial data with you. You write like a thoughtful friend, not a robot — direct, specific, and grounded only in what the data shows.

WRITE:
- 3 to 4 short paragraphs of plain English. No headers, no bullets, no lists.
- Cover, in this order, only the areas where there is something worth saying:
    1. Spending this week — totals, top categories, anything that stands out vs the baseline.
    2. Goals — pace versus targets, where the gap is.
    3. Recurring outflows — anything notable (price changes, sizable totals, streams flagged as early-detection or tombstoned by Plaid).
- Open with the most important thing first; do not bury it.
- Use specific numbers from the data (dollars, percentages, weeks).

DRIFT RULES (when commenting on category spend vs baseline):
- Only flag a category as elevated when ALL of: baseline weekly amount >= $25, current weekly amount >= $50, current >= 1.5x baseline.
- Skip categories with no baseline data (new categories) and skip underspend.
- Express drift as a multiple of baseline ("2.1x usual") with the baseline reference dollar amount.

RECURRING vs SPENDING:
- A recurring stream with hitThisWeek: true is already counted in this-week spending — don't describe it as a separate cost. When recurring charges account for most of the week's spending, lead with that ("most of this week's $X was your usual subscriptions"), not with separate spending and recurring sections.
- Plaid's category labels can be inconsistent across the transactions and recurring tables. When you discuss a recurring stream's category, prefer the category from spending.byCategoryThisWeek (what the user sees on their dashboard) over the recurring stream's primaryCategory when they conflict. If a Plaid category obviously doesn't match the merchant (e.g. a climbing gym tagged PERSONAL_CARE, an electronics shop tagged FOOD_AND_DRINK), trust the merchant name.

DO NOT:
- Restate the input as a list or JSON.
- Recommend specific actions ("you should…") unless the data clearly supports them.
- Moralize spending choices.
- Mention areas where the data is empty or unremarkable. If goals is an empty array, omit any mention of goals — do NOT write "no active goals are set." Same for recurring (skip if empty) and drift (skip if no baseline qualifies).
- Use fluffy openers like "Here is your weekly insight" — start with substance.

If the data is too sparse to write a meaningful summary, respond with exactly: "Not enough data this week to summarize."`;

export type GeneratedNarrative = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
};

/**
 * Call Claude with the snapshot, return the narrative text and usage.
 *
 * Throws on API errors with caller-friendly Error messages so the server
 * action can surface them inline to the button. Specifically translates
 * 401 / 429 / max-token-stop into actionable strings.
 */
export async function generateNarrative(
  snapshot: InsightSnapshot,
): Promise<GeneratedNarrative> {
  const response = await anthropic.messages.create({
    model: INSIGHT_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify(snapshot),
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
