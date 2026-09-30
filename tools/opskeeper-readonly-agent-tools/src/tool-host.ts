/**
 * Read-only Agent tool registry (Phase C, task 3.7).
 *
 * This is the central enforcement point for the four Phase C guards:
 *   1. JSON schema validation (schema.validate)
 *   2. Per-call timeout (timeout.withTimeout)
 *   3. Per-principal rate limit (rate-limit.RateLimiter)
 *   4. Audit log emission (audit-log.AuditLog)
 *
 * Each tool is registered with: name, description, JSON-schema, executor,
 * defaultTimeoutMs, and costInTokens. The registry rejects registration of
 * any tool whose name matches a deny-list prefix (mutation, shell,
 * cross-resource, write-mcp) — that is the static "no mutation capability"
 * tripwire that backs OpenSpec §F.
 *
 * The registry emits one audit record per call; the outcome reflects any
 * guard-rejection (rejected_schema / rejected_rate_limit / timeout / error)
 * or success.
 */

import { validate, ValidationError, type JsonSchema } from "./schema.js";
import { withTimeout, TimeoutError, DEFAULT_TIMEOUT_MS } from "./timeout.js";
import { RateLimiter, RateLimitError, type RateLimitConfig } from "./rate-limit.js";
import { AuditLog } from "./audit-log.js";

/** Hard-deny prefixes — any tool name matching one is rejected at registration. */
export const DENY_PREFIXES = [
  "execute",
  "shell",
  "mutate",
  "write-mcp",
  "write_",
  "delete",
  "drop",
  "destroy",
  "approve",
  "fix",
  "repair",
  "recover",
  "reset",
  "restart",
  "cross-resource",
] as const;

export interface ReadOnlyTool<
  Args extends Record<string, unknown> = Record<string, unknown>,
  Result = unknown,
> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly executor: (args: Args, ctx: ToolContext) => Promise<Result>;
  readonly defaultTimeoutMs?: number;
  readonly costInTokens?: number;
  readonly rateLimit?: Partial<RateLimitConfig>;
}

export interface ToolContext {
  readonly principalId: string;
  readonly callerId?: string;
  readonly opskeeperBaseUrl: string;
}

export interface ToolCall {
  toolName: string;
  args: unknown;
  principalId: string;
  callerId?: string;
}

export interface ToolCallResult {
  ok: boolean;
  outcome:
    | "ok"
    | "rejected_schema"
    | "rejected_rate_limit"
    | "rejected_policy"
    | "timeout"
    | "error";
  value?: unknown;
  errorKind?: string;
  errorMessage?: string;
  retryAfterMs?: number;
  audit: { seq: number; hash: string };
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export class Registry {
  private readonly tools: Map<string, ReadOnlyTool> = new Map();
  private readonly rateLimiters: Map<string, RateLimiter> = new Map();
  private readonly audit: AuditLog;

  constructor(audit: AuditLog = new AuditLog()) {
    this.audit = audit;
  }

  /**
   * Register a tool. Throws PolicyError if the name matches a deny prefix
   * or duplicates an existing registration.
   */
  register<T extends ReadOnlyTool>(tool: T): void {
    const lower = tool.name.toLowerCase();
    for (const deny of DENY_PREFIXES) {
      if (lower.startsWith(deny)) {
        throw new PolicyError(
          `Tool "${tool.name}" rejected: name matches deny prefix "${deny}"`,
        );
      }
    }
    if (this.tools.has(tool.name)) {
      throw new PolicyError(`Tool "${tool.name}" already registered`);
    }
    if (!tool.inputSchema || typeof tool.inputSchema !== "object") {
      throw new PolicyError(`Tool "${tool.name}" must declare an inputSchema`);
    }
    if (typeof tool.executor !== "function") {
      throw new PolicyError(`Tool "${tool.name}" must declare an executor`);
    }
    this.tools.set(tool.name, tool);
    if (tool.rateLimit) {
      const cfg: RateLimitConfig = {
        refillPerSecond: tool.rateLimit.refillPerSecond ?? 10,
        burst: tool.rateLimit.burst ?? 20,
        ...(tool.rateLimit.maxIdleMs !== undefined
          ? { maxIdleMs: tool.rateLimit.maxIdleMs }
          : {}),
      };
      this.rateLimiters.set(tool.name, new RateLimiter(cfg));
    }
  }

  /** All registered tool names. Used by the manifest validator. */
  list(): string[] {
    return Array.from(this.tools.keys()).sort();
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Invoke a tool by name. All four guards fire in this order:
   *   schema → rate-limit → timeout → executor → audit.
   *
   * Each branch emits exactly one audit record, so the audit log is a
   * reliable count of invocations regardless of outcome.
   */
  async call(req: ToolCall): Promise<ToolCallResult> {
    const tool = this.tools.get(req.toolName);
    const startedAt = Date.now();

    if (!tool) {
      const entry = await this.audit.record({
        tool: req.toolName,
        principalId: req.principalId,
        callerId: req.callerId,
        args: {},
        outcome: "rejected_policy",
        durationMs: Date.now() - startedAt,
        errorKind: "UnknownTool",
      });
      return {
        ok: false,
        outcome: "rejected_policy",
        errorKind: "UnknownTool",
        errorMessage: `Tool "${req.toolName}" is not registered`,
        audit: { seq: entry.seq, hash: entry.hash },
      };
    }

    // 1. JSON-schema validation
    let parsedArgs: Record<string, unknown>;
    try {
      const obj = (req.args ?? {}) as Record<string, unknown>;
      validate(obj, tool.inputSchema);
      parsedArgs = obj;
    } catch (err) {
      const e = err as ValidationError;
      const entry = await this.audit.record({
        tool: req.toolName,
        principalId: req.principalId,
        callerId: req.callerId,
        args: (req.args as Record<string, unknown>) ?? {},
        outcome: "rejected_schema",
        durationMs: Date.now() - startedAt,
        errorKind: e.name ?? "ValidationError",
      });
      return {
        ok: false,
        outcome: "rejected_schema",
        errorKind: e.name ?? "ValidationError",
        errorMessage: e.message,
        audit: { seq: entry.seq, hash: entry.hash },
      };
    }

    // 2. Rate limit
    const limiter = this.rateLimiters.get(req.toolName);
    if (limiter) {
      try {
        limiter.enforce(req.toolName, req.principalId, tool.costInTokens ?? 1);
      } catch (err) {
        const e = err as RateLimitError;
        const entry = await this.audit.record({
          tool: req.toolName,
          principalId: req.principalId,
          callerId: req.callerId,
          args: parsedArgs,
          outcome: "rejected_rate_limit",
          durationMs: Date.now() - startedAt,
          errorKind: e.name,
        });
        return {
          ok: false,
          outcome: "rejected_rate_limit",
          errorKind: e.name,
          errorMessage: e.message,
          retryAfterMs: e.retryAfterMs,
          audit: { seq: entry.seq, hash: entry.hash },
        };
      }
    }

    // 3. Timeout + 4. Executor
    const ctx: ToolContext = {
      principalId: req.principalId,
      ...(req.callerId !== undefined ? { callerId: req.callerId } : {}),
      opskeeperBaseUrl: "", // pass via caller; tools requiring base URL pull from here.
    };
    try {
      const result = await withTimeout(
        () => tool.executor(parsedArgs, ctx),
        { toolName: req.toolName, timeoutMs: tool.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS },
      );
      const entry = await this.audit.record({
        tool: req.toolName,
        principalId: req.principalId,
        callerId: req.callerId,
        args: parsedArgs,
        outcome: "ok",
        durationMs: Date.now() - startedAt,
        result,
      });
      return {
        ok: true,
        outcome: "ok",
        value: result,
        audit: { seq: entry.seq, hash: entry.hash },
      };
    } catch (err) {
      const isTimeout = err instanceof TimeoutError;
      const e = err as Error;
      const entry = await this.audit.record({
        tool: req.toolName,
        principalId: req.principalId,
        callerId: req.callerId,
        args: parsedArgs,
        outcome: isTimeout ? "timeout" : "error",
        durationMs: Date.now() - startedAt,
        errorKind: e.name,
      });
      return {
        ok: false,
        outcome: isTimeout ? "timeout" : "error",
        errorKind: e.name,
        errorMessage: e.message,
        audit: { seq: entry.seq, hash: entry.hash },
      };
    }
  }
}
