/**
 * Token-bucket rate limiter for read-only Agent tools (Phase C).
 *
 * Design choices:
 *   - In-memory token bucket per (toolName, principalId) pair. Paperclip is a
 *     single-tenant / single-node deployment (see security-review.md §3.11),
 *     so a process-local bucket is sufficient and avoids a stateful network
 *     dependency. Multi-node deployments would need an external limiter
 *     alongside, but that is out of scope for Phase C.
 *   - Per-principal: the Paperclip agent bears an opaque principalId (user or
 *     board id from Paperclip RBAC). Buckets are keyed accordingly so one
 *     caller cannot starve another.
 *   - Lazy refill: the bucket's token count is recomputed from `now()` on
 *     every `tryAcquire`, which avoids background timers that could leak
 *     between runs.
 *   - Burst-friendly: a small burst (`burst`) is permitted on top of the
 *     steady-state rate to smooth tool calls. The tool caller can pre-warm
 *     by issuing a small batch; sustained high rates are rejected.
 */

export interface RateLimitConfig {
  /** Sustained rate (tokens per second). */
  readonly refillPerSecond: number;
  /** Burst capacity (max tokens held at once). */
  readonly burst: number;
  /** Maximum before-now correction (ms). Buckets older than this are reset. */
  readonly maxIdleMs?: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Tokens remaining after this call (or 0 if rejected). */
  readonly remaining: number;
  /** Retry-after in ms (0 if allowed). */
  readonly retryAfterMs: number;
}

export class RateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(toolName: string, retryAfterMs: number) {
    super(`Tool "${toolName}" rate-limited; retry after ${retryAfterMs}ms`);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class RateLimiter {
  private readonly cfg: RateLimitConfig;
  private readonly buckets: Map<string, Bucket> = new Map();
  private readonly maxIdleMs: number;

  constructor(cfg: RateLimitConfig) {
    if (cfg.refillPerSecond <= 0) throw new Error("refillPerSecond must be positive");
    if (cfg.burst <= 0) throw new Error("burst must be positive");
    this.cfg = cfg;
    this.maxIdleMs = cfg.maxIdleMs ?? 5 * 60_000;
  }

  /** Inspect the current decision without consuming a token. */
  peek(toolName: string, principalId: string): RateLimitDecision {
    const b = this.buckets.get(key(toolName, principalId));
    if (!b) {
      return { allowed: true, remaining: this.cfg.burst, retryAfterMs: 0 };
    }
    const now = Date.now();
    const tokens = refill(b, now, this.cfg, this.maxIdleMs);
    return tokens >= 1
      ? { allowed: true, remaining: tokens - 1, retryAfterMs: 0 }
      : {
          allowed: false,
          remaining: tokens,
          retryAfterMs: waitMs(tokens, this.cfg),
        };
  }

  /**
   * Attempt to consume one token. Returns the decision; throws
   * RateLimitError when not allowed so callers can fall through to a
   * canonical error path.
   */
  tryAcquire(toolName: string, principalId: string, cost: number = 1): RateLimitDecision {
    const now = Date.now();
    const k = key(toolName, principalId);
    let b = this.buckets.get(k);
    if (!b) {
      b = { tokens: this.cfg.burst, lastRefillMs: now };
      this.buckets.set(k, b);
    }
    const tokens = refill(b, now, this.cfg, this.maxIdleMs);
    if (tokens < cost) {
      const retry = waitMs(tokens, this.cfg);
      return { allowed: false, remaining: tokens, retryAfterMs: retry };
    }
    b.tokens = tokens - cost;
    b.lastRefillMs = now;
    return { allowed: true, remaining: b.tokens, retryAfterMs: 0 };
  }

  /**
   * Hard-enforce a limit: throws if not allowed. Use from tool wrappers.
   */
  enforce(toolName: string, principalId: string, cost: number = 1): RateLimitDecision {
    const d = this.tryAcquire(toolName, principalId, cost);
    if (!d.allowed) throw new RateLimitError(toolName, d.retryAfterMs);
    return d;
  }

  /** Test helper: drop the entire bucket table. */
  reset(): void {
    this.buckets.clear();
  }
}

function key(toolName: string, principalId: string): string {
  return `${toolName}\u0000${principalId}`;
}

function refill(b: Bucket, now: number, cfg: RateLimitConfig, maxIdleMs: number): number {
  const elapsedMs = now - b.lastRefillMs;
  if (elapsedMs < 0) return b.tokens;
  if (elapsedMs > maxIdleMs) {
    // Bucket too stale — reset to full capacity (defensive).
    b.tokens = cfg.burst;
    b.lastRefillMs = now;
    return b.tokens;
  }
  const added = (elapsedMs / 1000) * cfg.refillPerSecond;
  return Math.min(cfg.burst, b.tokens + added);
}

function waitMs(tokens: number, cfg: RateLimitConfig): number {
  const missing = Math.max(0, 1 - tokens);
  return Math.ceil((missing / cfg.refillPerSecond) * 1000);
}
