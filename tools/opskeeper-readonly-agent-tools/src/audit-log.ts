/**
 * Audit log for read-only Agent tool calls (Phase C, task 3.7 + 3.11).
 *
 * Audit guarantees:
 *   - Every tool call emits a single record, even on validation or rate-limit
 *     failure. The outcome is recorded as "rejected"/"timeout"/"error"/"ok".
 *   - Records are append-only once written; the entry is sealed before the
 *     executor promise resolves so a crashed plugin cannot partially rewrite
 *     an entry.
 *   - Records NEVER contain raw secret material. Token-bearing headers are
 *     redacted to a fingerprint; no request body, response body, or stack
 *     trace is recorded.
 *   - The log is consumable by OpsKeeper's audit chain: each record carries
 *     a `prevHash` derived from the previous record so a downstream audit
 *     pipeline can verify sequencing.
 *
 * Wire format on disk: JSON Lines, one JSON object per line.
 */

import { createHash, randomUUID } from "node:crypto";

export type AuditOutcome =
  | "ok"
  | "rejected_schema"
  | "rejected_rate_limit"
  | "rejected_policy"
  | "timeout"
  | "error";

export interface AuditEntry {
  readonly seq: number;
  readonly timestamp: string; // ISO-8601 UTC
  readonly tool: string;
  readonly principalId: string;
  readonly caller: string; // e.g. host + tool-call id
  readonly argsDigest: string; // SHA-256 of canonical args (sensitive values redacted)
  readonly outcome: AuditOutcome;
  readonly durationMs: number;
  readonly errorKind?: string; // e.g. "ValidationError", "TimeoutError"
  readonly resultDigest?: string; // SHA-256 of result summary, redacted
  readonly prevHash: string;
  readonly hash: string;
}

export interface AuditLogOptions {
  /** Local sink: a function that receives an entry. Default = stderr JSONL. */
  sink?: (entry: AuditEntry) => Promise<void> | void;
  /** Host identifier (paperclip host name, pod id, etc.). */
  hostId?: string;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(token|secret|password|authorization|api[-_]?key)/i, "***REDACTED***"],
];

export class AuditLog {
  private readonly sink: (entry: AuditEntry) => Promise<void> | void;
  private readonly hostId: string;
  private seq = 0;
  private prevHash = "0".repeat(64);
  private inflight = Promise.resolve();

  constructor(opts: AuditLogOptions = {}) {
    this.sink =
      opts.sink ??
      ((entry) => {
        // Default sink: stderr JSONL, never stdout (stdout may be piped to
        // downstream tools that don't tolerate audit-trail mutations).
        process.stderr.write(JSON.stringify(entry) + "\n");
      });
    this.hostId = opts.hostId ?? "paperclip-local";
  }

  /**
   * Build and persist a single audit record. The caller passes either the
   * resolved result and a successful outcome, or the error and the
   * matching outcome tag. Internally, write is serialized so audit entries
   * preserve temporal order even under burst callers.
   */
  record(args: {
    tool: string;
    principalId: string;
    callerId?: string;
    args: Record<string, unknown>;
    outcome: AuditOutcome;
    durationMs: number;
    errorKind?: string;
    result?: unknown;
  }): Promise<AuditEntry> {
    const captured = args;

    const fire = async (): Promise<AuditEntry> => {
      const argsDigest = digest(canonicalize(redact(captured.args)));
      const resultDigest =
        captured.result !== undefined
          ? digest(canonicalize(redact(captured.result)))
          : undefined;

      this.seq += 1;
      const entry: AuditEntry = {
        seq: this.seq,
        timestamp: new Date().toISOString(),
        tool: captured.tool,
        principalId: captured.principalId,
        caller: `${this.hostId}:${captured.callerId ?? randomUUID()}`,
        argsDigest,
        outcome: captured.outcome,
        durationMs: captured.durationMs,
        ...(captured.errorKind !== undefined ? { errorKind: captured.errorKind } : {}),
        ...(resultDigest !== undefined ? { resultDigest } : {}),
        prevHash: this.prevHash,
        hash: "", // filled below
      };
      entry.hash = hashEntry(entry, this.hostId);
      this.prevHash = entry.hash;
      await this.sink(entry);
      return entry;
    };

    // Serialize writes so prevHash ordering is correct even under bursts.
    this.inflight = this.inflight.then(fire, fire);
    return this.inflight;
  }

  /** Test helper: current sequence number (most recently written + 1 = next). */
  nextSeq(): number {
    return this.seq + 1;
  }
}

/**
 * Recursively redact any keys that look like secrets. The redacted value is
 * a constant sentinel so downstream tooling can assert that the redactor
 * fired but never leak the original material.
 */
export function redact<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_PATTERNS.some(([re]) => re.test(k))) {
      out[k] = "***REDACTED***";
    } else {
      out[k] = redact(v);
    }
  }
  return out as unknown as T;
}

/**
 * Canonicalize a JSON-safe value into a stable string form for hashing.
 * Sort object keys lexicographically so {a:1,b:2} and {b:2,a:1} hash equal.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return (
      "{" +
      keys
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonicalize((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

export function digest(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function hashEntry(entry: AuditEntry, hostId: string): string {
  // Deterministic: rebuild from canonical fields only.
  const c = canonicalize({
    seq: entry.seq,
    timestamp: entry.timestamp,
    tool: entry.tool,
    principalId: entry.principalId,
    caller: entry.caller,
    argsDigest: entry.argsDigest,
    outcome: entry.outcome,
    durationMs: entry.durationMs,
    errorKind: entry.errorKind,
    resultDigest: entry.resultDigest,
    prevHash: entry.prevHash,
    hostId,
  });
  return digest(c);
}
