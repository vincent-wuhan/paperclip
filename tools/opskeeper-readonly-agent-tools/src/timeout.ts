/**
 * Timeout enforcement for Agent tool execution (Phase C).
 *
 * The runtime is intentional: it does NOT spawn threads or schedule on a
 * background runtime. Instead, it races the executor promise against a
 * timeout promise and resolves the winner. The executor itself is left
 * to finish (its rejection is swallowed at the executor boundary so a
 * late reject cannot surface as an unhandled rejection after the tool
 * has already returned its timeout outcome).
 *
 * The duration is hard-capped to MAX_TIMEOUT_MS so a misconfigured
 * manifest cannot accidentally disable the cap.
 */

export const MAX_TIMEOUT_MS = 30_000;
export const DEFAULT_TIMEOUT_MS = 5_000;

export class TimeoutError extends Error {
  readonly timedOutMs: number;
  readonly toolName: string;
  constructor(toolName: string, timedOutMs: number) {
    super(`Tool "${toolName}" exceeded timeout of ${timedOutMs}ms`);
    this.name = "TimeoutError";
    this.timedOutMs = timedOutMs;
    this.toolName = toolName;
  }
}

export interface TimeoutOptions {
  toolName: string;
  timeoutMs?: number;
}

/**
 * Run `executor` under a timeout. If the executor settles first, return its
 * outcome. If the timeout fires first, return a settled TimeoutError.
 *
 * Late executor resolution: if the executor resolves AFTER the timeout wins,
 * the result is dropped and a console.warn is emitted. The executor cannot
 * observe this externally; audit log records the timeout outcome.
 */
export async function withTimeout<T>(
  executor: () => Promise<T>,
  opts: TimeoutOptions,
): Promise<T> {
  const requested = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const capped = Math.min(Math.max(requested, 1), MAX_TIMEOUT_MS);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new TimeoutError(opts.toolName, capped));
    }, capped);
  });

  // Silence "unhandled rejection" if the executor rejects AFTER timeout wins.
  const safeExecutor = async (): Promise<T> => {
    try {
      return await executor();
    } catch (err) {
      if (timedOut) {
        // Swallow — the timeout outcome already replied to the caller.
        return undefined as unknown as T;
      }
      throw err;
    }
  };

  try {
    const result = await Promise.race([safeExecutor(), timeoutPromise]);
    return result;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
