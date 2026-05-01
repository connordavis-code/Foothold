import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

/**
 * Server-only Anthropic SDK client. ANTHROPIC_API_KEY is optional in env, so
 * the action layer is responsible for surfacing a friendly error when it's
 * missing — calling the SDK with an empty key returns a 401 we'd rather
 * pre-empt with a clear message.
 *
 * Never import this from client components — it carries the API key.
 */
export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY ?? '',
});

export const hasAnthropicKey = (): boolean =>
  Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 0);
