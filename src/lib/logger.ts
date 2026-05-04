import { db } from '@/lib/db';
import { errorLog } from '@/lib/db/schema';

type Context = Record<string, unknown>;

/**
 * Operational logger writing to error_log. Surfaces failures + cron run
 * summaries to the daily Resend digest (Phase 5: cron + monitoring).
 *
 * Critical invariant: these MUST NOT throw. A logger that fails loudly
 * inside a `catch` block masks the original error, and a logger that
 * fails inside a logger fall-back creates a death spiral. We swallow
 * DB errors and emit to stderr as a last resort.
 */

function extractItemId(ctx?: Context): {
  plaidItemId: string | null;
  rest: Context | null;
} {
  if (!ctx) return { plaidItemId: null, rest: null };
  const { plaidItemId, ...rest } = ctx;
  return {
    plaidItemId: typeof plaidItemId === 'string' ? plaidItemId : null,
    rest: Object.keys(rest).length > 0 ? rest : null,
  };
}

export async function logError(
  op: string,
  err: unknown,
  ctx?: Context,
): Promise<void> {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const { plaidItemId, rest } = extractItemId(ctx);
    await db.insert(errorLog).values({
      level: 'error',
      op,
      plaidItemId,
      message,
      context: stack ? { ...(rest ?? {}), stack } : rest,
    });
  } catch (loggerError) {
    console.error('[logger] failed to log error', {
      op,
      original: err,
      loggerError,
    });
  }
}

export async function logRun(
  op: string,
  message: string,
  ctx?: Context,
): Promise<void> {
  try {
    const { plaidItemId, rest } = extractItemId(ctx);
    await db.insert(errorLog).values({
      level: 'info',
      op,
      plaidItemId,
      message,
      context: rest,
    });
  } catch (loggerError) {
    console.error('[logger] failed to log run', {
      op,
      message,
      loggerError,
    });
  }
}
