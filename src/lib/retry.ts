export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
};

/** Retry with exponential backoff. Used around every external API call (LLM, TTS, images). */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const base = opts.baseDelayMs ?? 1000;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        opts.onRetry?.(i + 1, err);
        await new Promise((r) => setTimeout(r, base * 2 ** i));
      }
    }
  }
  throw lastError;
}
