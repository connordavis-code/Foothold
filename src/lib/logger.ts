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
  externalItemId: string | null;
  rest: Context | null;
} {
  if (!ctx) return { externalItemId: null, rest: null };
  const { externalItemId, ...rest } = ctx;
  return {
    externalItemId:
      typeof externalItemId === 'string' ? externalItemId : null,
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
    const { externalItemId, rest } = extractItemId(ctx);
    await db.insert(errorLog).values({
      level: 'error',
      op,
      externalItemId,
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
    const { externalItemId, rest } = extractItemId(ctx);
    await db.insert(errorLog).values({
      level: 'info',
      op,
      externalItemId,
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
