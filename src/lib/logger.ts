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

// Plaid + SnapTrade SDKs both throw axios-shaped errors. Their structured
// upstream payload (Plaid: error_code/error_type/error_message/request_id;
// SnapTrade: similar) lives on `err.response.data`. Without capturing it,
// 4xx error_log rows read as opaque "Request failed with status code 400"
// and root-causing requires reproducing manually. Duck-type so we don't
// import axios just for the type guard.
function extractAxiosResponse(err: unknown): {
  status: number;
  data: unknown;
} | null {
  if (!err || typeof err !== 'object') return null;
  // SnaptradeError-style wrappers flatten the axios fields:
  // `err.status` and `err.responseBody`, with no nested `err.response`.
  // Check this shape first; it's strictly more specific than raw axios
  // (a raw AxiosError has neither field at the top level).
  const flatStatus = (err as { status?: unknown }).status;
  if (typeof flatStatus === 'number') {
    return {
      status: flatStatus,
      data: (err as { responseBody?: unknown }).responseBody ?? null,
    };
  }
  const r = (err as { response?: unknown }).response;
  if (!r || typeof r !== 'object') return null;
  const status = (r as { status?: unknown }).status;
  if (typeof status !== 'number') return null;
  return { status, data: (r as { data?: unknown }).data ?? null };
}

export async function logError(
  op: string,
  err: unknown,
  ctx?: Context,
): Promise<void> {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const axiosResponse = extractAxiosResponse(err);
    const { externalItemId, rest } = extractItemId(ctx);
    const context: Context = {
      ...(rest ?? {}),
      ...(stack ? { stack } : {}),
      ...(axiosResponse
        ? {
            httpStatus: axiosResponse.status,
            responseBody: axiosResponse.data,
          }
        : {}),
    };
    await db.insert(errorLog).values({
      level: 'error',
      op,
      externalItemId,
      message,
      context: Object.keys(context).length > 0 ? context : null,
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
