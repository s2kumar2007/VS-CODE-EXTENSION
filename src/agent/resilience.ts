/** Raised when every model (primary, then fallback) failed. Message is safe to show the user. */
export class ForgeFailure extends Error {}
/** Raised when the user cancelled while we were waiting/backing off. */
export class CancelledError extends Error {}

export interface FallbackOptions<T> {
  primary: string;
  fallback?: string;
  /** Retries per agent after the first try (spec: 2). Backoff is backoffMs * 2^n. */
  retries: number;
  backoffMs: number;
  sleep: (ms: number) => Promise<void>;
  attempt: (agent: string) => Promise<T>;
  isCancelled: () => boolean;
  canRetry?: () => boolean;
  onRetry?: (agent: string, retryNo: number, err: unknown) => void;
  onFallback?: (err: unknown) => void;
}

/** Short, stack-free reason for the one error message the user sees. */
export function briefReason(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split('\n')[0]!.replace(/\s+/g, ' ').slice(0, 160);
}

/** Quota retry hints can arrive in turn.done text rather than HTTP headers. */
function retryDelay(error: unknown, exponentialMs: number): number {
  const message = error instanceof Error ? error.message : String(error);
  if (!/\b429\b/.test(message)) return exponentialMs;
  const hint = /(?:retry|try\s+again)\s+in\s+(\d+(?:\.\d+)?)s\b/i.exec(message);
  if (!hint) return exponentialMs;
  const seconds = Number(hint[1]);
  if (!Number.isFinite(seconds)) return exponentialMs;
  return Math.max(exponentialMs, Math.min(60_000, Math.ceil(seconds * 1000) + 250));
}

/**
 * try primary (1 + `retries` times with exponential backoff) -> switch to the fallback agent
 * (fresh session, same request, handled by `attempt`) -> else throw ONE clear ForgeFailure.
 * A cancelled run is never retried.
 */
export async function runWithFallback<T>(o: FallbackOptions<T>): Promise<T> {
  const agents = [o.primary, ...(o.fallback && o.fallback !== o.primary ? [o.fallback] : [])];
  let lastErr: unknown;
  for (let a = 0; a < agents.length; a++) {
    const agent = agents[a]!;
    for (let i = 0; i <= o.retries; i++) {
      if (o.isCancelled()) throw new CancelledError();
      try {
        return await o.attempt(agent);
      } catch (e) {
        lastErr = e;
        if (o.isCancelled()) throw new CancelledError();
        if (o.canRetry && !o.canRetry()) throw new ForgeFailure('The run stopped after an approved operation; automatic replay was skipped.');
        if (i < o.retries) {
          o.onRetry?.(agent, i + 1, e);
          await o.sleep(retryDelay(e, o.backoffMs * 2 ** i));
        }
      }
    }
    if (a === 0 && agents.length > 1) o.onFallback?.(lastErr);
  }
  throw new ForgeFailure(agents.length > 1
    ? `Both the primary and fallback models failed (${briefReason(lastErr)}).`
    : `The model request failed (${briefReason(lastErr)}).`);
}
