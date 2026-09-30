/**
 * Read-only OpsKeeper fetch wrappers (Phase C, 3.7).
 *
 * The wrappers below are the ONLY allowed way for an Agent tool to reach
 * OpsKeeper. They are intentionally narrow:
 *   - GET / HEAD only.
 *   - Per-call timeout (defaults to 5s, hard-capped at 30s).
 *   - Bearer token applied ONLY when the tool opts in via an injected
 *     env var; the token never appears in tool output, audit logs, or args.
 *   - No follow-redirect (avoids redirects to untrusted origins becoming
 *     an exfiltration primitive).
 *   - Per-host allow-list: callers MUST pass `allowedHosts` and we raise
 *     an error if the resolved URL falls outside. By default, "localhost"
 *     is excluded to prevent loopback use except when explicitly added.
 */

export interface ReadOnlyFetchOptions {
  baseUrl: string;
  method?: "GET" | "HEAD";
  path: string;
  query?: Record<string, string>;
  token?: string | undefined;
  timeoutMs?: number;
  allowedHosts: ReadonlySet<string>;
  fetchImpl?: typeof fetch;
}

export class NotAllowedError extends Error {
  constructor(host: string) {
    super(`Host not in egress allow-list: ${host}`);
    this.name = "NotAllowedError";
  }
}

export class ReadOnlyFetchError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(`OpsKeeper ${status}: ${message}`);
    this.name = "ReadOnlyFetchError";
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

/**
 * Read-only OpsKeeper fetch. Throws on non-2xx so callers can branch
 * safely. The hostname MUST be in `allowedHosts`; the only exception is
 * localhost when `allowedHosts` is configured with explicit loopback.
 */
export async function opskeeperRead<T>(opts: ReadOnlyFetchOptions): Promise<T> {
  const method = opts.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    throw new Error(`read-only fetch denied: method ${method}`);
  }
  const base = new URL(opts.baseUrl);
  const target = new URL(opts.path, base);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    target.searchParams.set(k, v);
  }
  if (!opts.allowedHosts.has(target.host)) {
    throw new NotAllowedError(target.host);
  }
  const capped = Math.min(
    Math.max(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, 100),
    MAX_TIMEOUT_MS,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), capped);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(target.toString(), {
      method,
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  // Manual redirect: never follow.
  if (res.status >= 300 && res.status < 400) {
    throw new ReadOnlyFetchError(310, "redirects are not allowed");
  }
  if (!res.ok) {
    throw new ReadOnlyFetchError(res.status, res.statusText);
  }
  if (method === "HEAD") {
    return undefined as unknown as T;
  }
  return (await res.json()) as T;
}
