// Lightweight client wrapper used by the contract test cases.
// Mirrors what the Phase A sync layer will eventually look like, intentionally
// small so it stays a verifiable reference implementation.
//
// Design notes:
// - The server is the source of truth for scope / auth decisions. The client
//   does not pre-check the token; it sends what was provided and reacts to
//   the response code. This catches scope mismatches uniformly as 401/403
//   rather than letting a stricter client mask problems.
// - The cursor only advances on 2xx. 5xx / timeout / 4xx leave it untouched.
// - Every failure path emits a structured log entry carrying a trace_id,
//   category, and the active phase (S1).

export type Scope = "ok-readonly" | "ok-approval" | "unknown";

export interface ClientOpts {
  baseUrl: string;
  token: string;
  /** Per-request timeout in ms (default 1500). */
  timeoutMs?: number;
  log?: (entry: { level: "info" | "warn" | "error"; trace_id?: string; category?: string; phase?: string; msg: string }) => void;
}

export interface SyncState {
  cursor: string | null;
  status: "idle" | "ok" | "stale" | "stopped-secret-invalid";
  archives: number;
  conflict_dedup: number;
  lastTraceId: string | null;
}

export interface ClientResponse<T = unknown> {
  code: number;
  trace_id: string;
  body: T;
}

export class OpsKeeperClient {
  state: SyncState = {
    cursor: null,
    status: "idle",
    archives: 0,
    conflict_dedup: 0,
    lastTraceId: null,
  };

  constructor(private opts: ClientOpts) {}

  scope(): Scope {
    const t = this.opts.token.trim();
    if (t.startsWith("ok-readonly-")) return "ok-readonly";
    if (t.startsWith("ok-approval-")) return "ok-approval";
    return "unknown";
  }

  private setOk(traceId: string): void {
    this.state.status = "ok";
    this.state.lastTraceId = traceId;
  }

  async listIncidents(): Promise<ClientResponse<{ incidents: Array<Record<string, unknown>>; cursor?: string }> | null> {
    const res = await this.fetch<{ incidents?: Array<Record<string, unknown>>; cursor?: string }>("/api/v1/incidents", { method: "GET" });
    if (!res) return null;
    if (res.code >= 200 && res.code < 300) {
      this.setOk(res.trace_id);
      const body = res.body ?? {};
      if (body.cursor && typeof body.cursor === "string") this.state.cursor = body.cursor;
      return res;
    }
    return res;
  }

  async archive(id: string): Promise<ClientResponse & { side_effect: "archived" | "idempotent" | "none" }> {
    const res = await this.fetch(`/api/v1/incidents/${id}/archive`, { method: "POST" });
    if (!res) return { ...this.empty(0), side_effect: "none" };
    if (res.code === 409) {
      this.state.conflict_dedup += 1;
      return { ...res, side_effect: "idempotent" };
    }
    if (res.code >= 200 && res.code < 300) {
      this.state.archives += 1;
      this.setOk(res.trace_id);
      return { ...res, side_effect: "archived" };
    }
    return { ...res, side_effect: "none" };
  }

  async createApproval(incidentId: string): Promise<ClientResponse<{ id: string }>> {
    const res = await this.fetch<{ id: string }>("/api/v1/approvals", {
      method: "POST",
      body: JSON.stringify({ incident_id: incidentId }),
      headers: { "content-type": "application/json" },
    });
    if (!res) return { ...this.empty(0), body: { id: "" } };
    if (res.code >= 200 && res.code < 300) this.setOk(res.trace_id);
    return res;
  }

  private empty(code: number): { code: number; trace_id: string } {
    return { code, trace_id: this.state.lastTraceId ?? "" };
  }

  async fetch<T = unknown>(path: string, init: RequestInit = {}): Promise<ClientResponse<T> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 1500);
    try {
      const res = await fetch(`${this.opts.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.opts.token}`,
          "x-trace-id": randomTraceId(),
          ...(init.headers ?? {}),
        },
      });
      const traceId = res.headers.get("x-trace-id") ?? "";
      this.state.lastTraceId = traceId;
      const body = (await res.json().catch(() => ({}))) as T;

      if (res.status === 401) {
        this.state.status = "stopped-secret-invalid";
        this.opts.log?.({ level: "error", trace_id: traceId, phase: "S1", category: "auth-401", msg: `401 received on ${path}` });
      } else if (res.status === 403) {
        this.state.status = "stopped-secret-invalid";
        this.opts.log?.({ level: "error", trace_id: traceId, phase: "S1", category: "auth-403", msg: `403 received on ${path}` });
      } else if (res.status >= 500) {
        this.opts.log?.({ level: "warn", trace_id: traceId, phase: "S1", category: "server-error-5xx", msg: `${res.status} ${path}` });
      } else if (res.status === 409) {
        this.opts.log?.({ level: "warn", trace_id: traceId, phase: "S1", category: "idempotent-409", msg: `409 ${path}` });
      } else if (res.status >= 200 && res.status < 300) {
        this.opts.log?.({ level: "info", trace_id: traceId, phase: "S1", category: "ok", msg: `${res.status} ${path}` });
      }
      return { code: res.status, trace_id: traceId, body };
    } catch (err) {
      // timeout / network drop — mark stale, do not pollute cursor
      this.state.status = "stale";
      this.opts.log?.({
        level: "warn",
        phase: "S1",
        category: "timeout",
        msg: `${path} aborted: ${(err as Error).message}`,
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

function randomTraceId() {
  return Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
}
