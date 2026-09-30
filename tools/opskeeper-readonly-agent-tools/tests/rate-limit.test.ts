import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, RateLimitError } from "../src/rate-limit.ts";

test("rate limit: burst allows exactly N then rejects", () => {
  const rl = new RateLimiter({ refillPerSecond: 1, burst: 3 });
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(rl.tryAcquire("t", "u", 1).allowed, true);
  }
  const d = rl.tryAcquire("t", "u", 1);
  assert.equal(d.allowed, false);
  assert.ok(d.retryAfterMs > 0, "retry-after must be positive");
});

test("rate limit: enforce throws RateLimitError on rejection", () => {
  const rl = new RateLimiter({ refillPerSecond: 1, burst: 1 });
  rl.enforce("t", "u");
  assert.throws(() => rl.enforce("t", "u"), RateLimitError);
});

test("rate limit: buckets are per principal", () => {
  const rl = new RateLimiter({ refillPerSecond: 1, burst: 1 });
  rl.enforce("t", "u1");
  // u2 still has full bucket.
  rl.enforce("t", "u2");
  assert.throws(() => rl.enforce("t", "u1"), RateLimitError);
});

test("rate limit: invalid config rejected at construction", () => {
  assert.throws(() => new RateLimiter({ refillPerSecond: 0, burst: 1 }));
  assert.throws(() => new RateLimiter({ refillPerSecond: 1, burst: 0 }));
});
