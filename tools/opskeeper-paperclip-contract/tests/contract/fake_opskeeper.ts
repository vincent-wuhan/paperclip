// Fake OpsKeeper Contract Server
// Contract baseline for the OpsKeeper connector.
// Provides a deterministic, scriptable HTTP server that emulates the
// OpsKeeper v1 API surface listed in `baseline.lock#fake_contract_server`.
// Token-bucket scopes: `ok-readonly`, `ok-approval`. Admin tokens rejected.
//
// Run as a daemon:
//   npx tsx tests/contract/fake_opskeeper.ts --port 4117
//
// Run embedded (in-process):
//   import { startFakeOpsKeeper } from "./fake_opskeeper";
//   const ctx = await startFakeOpsKeeper({ port: 0 });
//   // ... use ctx.url
//   await ctx.close();
//
// Failure-path triggers are wired via per-path mutation routes so tests can
// flip them deterministically without restarting the server.

import http from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type FailureMode = "normal" | "5xx" | "timeout" | "401" | "403" | "409";

export interface ServerOpts {
  port?: number;
  /** Pre-shared HMAC secret for webhook verification. */
  webhookSecret?: string;
  /** Optional overrides for test scenarios. */
  readonlySeed?: ReadonlyArray<Incident>;
}

export interface ServerCtx {
  url: string;
  port: number;
  /** Per-path failure mode setter. */
  setFailure: (path: string, mode: FailureMode) => void;
  /** Emit a webhook event into the receiver queue. */
  triggerWebhook: (event: WebhookEvent) => void;
  /** Reset all state. */
  reset: () => void;
  /** Inspect collected state (for assertions). */
  state: ServerState;
  close: () => Promise<void>;
}

export interface ServerState {
  requests: Array<{
    trace_id: string;
    method: string;
    path: string;
    token_scope: "ok-readonly" | "ok-approval" | "rejected";
    trace: Record<string, unknown>;
  }>;
  archives: number;
  approvals: Array<{ id: string; scope: string }>;
  webhookEvents: WebhookEvent[];
}

export interface Incident {
  id: string;
  status: "open" | "archived";
  title: string;
  severity: "low" | "medium" | "high";
  created_at: string;
  timeline?: Array<{ at: string; note: string }>;
  evidence?: Array<{ url: string; kind: string }>;
}

export interface WebhookEvent {
  type: "incident.created" | "incident.archived" | "approval.requested";
  data: Record<string, unknown>;
}

const DEFAULT_INCIDENTS: Incident[] = [
  {
    id: "inc-1001",
    status: "open",
    title: "DB replica lag spike",
    severity: "high",
    created_at: "2026-09-28T06:00:00Z",
    timeline: [{ at: "2026-09-28T06:00:00Z", note: "lag=120s" }],
    evidence: [{ url: "opskeeper://incidents/inc-1001/evidence/0", kind: "metric" }],
  },
  {
    id: "inc-1002",
    status: "open",
    title: "Kafka consumer stalling",
    severity: "medium",
    created_at: "2026-09-28T06:30:00Z",
  },
];

const VALID_SCOPES = new Set(["ok-readonly", "ok-approval"]);
const REJECTED_PATTERNS = [/^ok-admin-/, /^ok-write-/, /^ok-exec-/, /^admin-/, /^root-/];

function classifyToken(token: string | undefined): "ok-readonly" | "ok-approval" | "rejected" {
  if (!token) return "rejected";
  const trimmed = token.trim();
  if (REJECTED_PATTERNS.some((re) => re.test(trimmed))) return "rejected";
  if (trimmed.startsWith("ok-readonly-")) return "ok-readonly";
  if (trimmed.startsWith("ok-approval-")) return "ok-approval";
  return "rejected";
}

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function startFakeOpsKeeper(opts: ServerOpts = {}): Promise<ServerCtx> {
  const port = opts.port ?? 4117;
  const webhookSecret = opts.webhookSecret ?? "test-webhook-secret";
  const state: ServerState = {
    requests: [],
    archives: 0,
    approvals: [],
    webhookEvents: [],
  };
  const incidents: Incident[] = [...(opts.readonlySeed ?? DEFAULT_INCIDENTS)];
  const failureModes = new Map<string, FailureMode>();
  const approvals = new Map<string, { id: string; scope: string; status: string }>();

  const server = http.createServer(async (req, res) => {
    const traceId = req.headers["x-trace-id"]?.toString() ?? randomUUID();
    res.setHeader("x-trace-id", traceId);
    res.setHeader("content-type", "application/json");

    const auth = req.headers["authorization"]?.toString() ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    const scope = classifyToken(token);

    const url = new URL(req.url ?? "/", "http://localhost");
    const pathKey = `${req.method ?? "GET"} ${url.pathname}`;
    state.requests.push({
      trace_id: traceId,
      method: req.method ?? "GET",
      path: url.pathname,
      token_scope: scope,
      trace: { ua: req.headers["user-agent"] ?? "" },
    });

    // ---------- 1. control plane (no auth required) ----------
    if (url.pathname === "/__control/failure" && req.method === "POST") {
      const body = await parseBody(req);
      try {
        const { path, mode } = JSON.parse(body) as { path: string; mode: FailureMode };
        failureModes.set(path, mode);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, path, mode }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "bad_json" }));
      }
      return;
    }
    if (url.pathname === "/__control/state" && req.method === "GET") {
      res.statusCode = 200;
      res.end(JSON.stringify(state));
      return;
    }
    if (url.pathname === "/__control/reset" && req.method === "POST") {
      state.requests.length = 0;
      state.archives = 0;
      state.approvals.length = 0;
      state.webhookEvents.length = 0;
      failureModes.clear();
      incidents.length = 0;
      incidents.push(...(opts.readonlySeed ?? DEFAULT_INCIDENTS));
      approvals.clear();
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ---------- 2. failure mode intercept ----------
    const activeMode = failureModes.get(pathKey);
    if (activeMode === "401") {
      res.statusCode = 401;
      res.end(JSON.stringify({ trace_id: traceId, error: "unauthorized" }));
      return;
    }
    if (activeMode === "403") {
      res.statusCode = 403;
      res.end(JSON.stringify({ trace_id: traceId, error: "forbidden" }));
      return;
    }
    if (activeMode === "5xx") {
      res.statusCode = 503;
      res.end(JSON.stringify({ trace_id: traceId, error: "upstream_unavailable" }));
      return;
    }
    if (activeMode === "409") {
      res.statusCode = 409;
      res.end(JSON.stringify({ trace_id: traceId, error: "conflict_synthetic" }));
      return;
    }
    if (activeMode === "timeout") {
      // Hold the connection open; tests use a short client timeout to bail.
      setTimeout(() => {
        try {
          res.statusCode = 504;
          res.end(JSON.stringify({ trace_id: traceId, error: "gateway_timeout" }));
        } catch {
          /* server closed */
        }
      }, 6000);
      return;
    }

    // ---------- 3. scope guard ----------
    if (scope === "rejected") {
      res.statusCode = 401;
      res.end(JSON.stringify({ trace_id: traceId, error: "invalid_token" }));
      return;
    }

    // ---------- 4. contract routes ----------
    if (req.method === "GET" && url.pathname === "/api/v1/incidents") {
      if (scope !== "ok-readonly") return reject403(res, traceId, "scope_mismatch");
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          trace_id: traceId,
          cursor: "cur-next",
          incidents: incidents.filter((i) => i.status === "open"),
        }),
      );
      return;
    }

    const detailMatch = url.pathname.match(/^\/api\/v1\/incidents\/([^/]+)$/);
    if (req.method === "GET" && detailMatch) {
      if (scope !== "ok-readonly") return reject403(res, traceId, "scope_mismatch");
      const inc = incidents.find((i) => i.id === detailMatch[1]);
      if (!inc) {
        res.statusCode = 404;
        res.end(JSON.stringify({ trace_id: traceId, error: "not_found" }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ trace_id: traceId, incident: inc }));
      return;
    }

    const archiveMatch = url.pathname.match(/^\/api\/v1\/incidents\/([^/]+)\/archive$/);
    if (req.method === "POST" && archiveMatch) {
      if (scope !== "ok-readonly") return reject403(res, traceId, "scope_mismatch");
      const inc = incidents.find((i) => i.id === archiveMatch[1]);
      if (!inc) {
        res.statusCode = 404;
        res.end(JSON.stringify({ trace_id: traceId, error: "not_found" }));
        return;
      }
      if (inc.status === "archived") {
        if (activeMode === "409" || activeMode === "normal" || activeMode === undefined) {
          // default idempotent: 409 with `already_archived` to surface to client
          res.statusCode = 409;
          res.end(JSON.stringify({ trace_id: traceId, error: "already_archived" }));
          return;
        }
      }
      inc.status = "archived";
      state.archives += 1;
      res.statusCode = 200;
      res.end(JSON.stringify({ trace_id: traceId, id: inc.id, status: "archived" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/approvals") {
      if (scope !== "ok-approval") return reject403(res, traceId, "scope_mismatch");
      const body = await parseBody(req);
      let parsed: { incident_id?: string } = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ trace_id: traceId, error: "bad_json" }));
        return;
      }
      if (!parsed.incident_id || !incidents.some((i) => i.id === parsed.incident_id)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ trace_id: traceId, error: "incident_not_found" }));
        return;
      }
      const id = `apr-${randomUUID().slice(0, 8)}`;
      const record = { id, scope: "ok-approval", status: "pending" };
      approvals.set(id, record);
      state.approvals.push({ id, scope: "ok-approval" });
      res.statusCode = 201;
      res.end(JSON.stringify({ trace_id: traceId, ...record }));
      return;
    }

    const aprMatch = url.pathname.match(/^\/api\/v1\/approvals\/([^/]+)$/);
    if (req.method === "GET" && aprMatch) {
      if (scope !== "ok-approval") return reject403(res, traceId, "scope_mismatch");
      const apr = approvals.get(aprMatch[1]);
      if (!apr) {
        res.statusCode = 404;
        res.end(JSON.stringify({ trace_id: traceId, error: "not_found" }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ trace_id: traceId, ...apr }));
      return;
    }

    // ---------- 5. webhook receiver (paperclip side; emitted by fake for tests) ----------
    if (req.method === "POST" && url.pathname === "/plugin/events") {
      const body = await parseBody(req);
      const provided = req.headers["x-opskeeper-signature"]?.toString() ?? "";
      const expected = sign(body, webhookSecret);
      // constant-time compare; if mismatch still return 200 to demonstrate "bad sig ignored"
      let valid = false;
      try {
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        valid = a.length === b.length && timingSafeEqual(a, b);
      } catch {
        valid = false;
      }
      if (!valid) {
        res.statusCode = 200; // webhook receivers ack-and-drop on bad sig
        res.end(JSON.stringify({ trace_id: traceId, accepted: false, reason: "bad_signature" }));
        return;
      }
      try {
        const evt = JSON.parse(body) as WebhookEvent;
        state.webhookEvents.push(evt);
        res.statusCode = 200;
        res.end(JSON.stringify({ trace_id: traceId, accepted: true }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ trace_id: traceId, error: "bad_json" }));
      }
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ trace_id: traceId, error: "route_not_found" }));
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const actualPort = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    port: actualPort,
    setFailure: (p, m) => failureModes.set(p, m),
    triggerWebhook: (event) => state.webhookEvents.push(event),
    reset: () => {
      state.requests.length = 0;
      state.archives = 0;
      state.approvals.length = 0;
      state.webhookEvents.length = 0;
      failureModes.clear();
      incidents.length = 0;
      incidents.push(...(opts.readonlySeed ?? DEFAULT_INCIDENTS));
      approvals.clear();
    },
    state,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function reject403(res: http.ServerResponse, traceId: string, reason: string) {
  res.statusCode = 403;
  res.end(JSON.stringify({ trace_id: traceId, error: "forbidden", reason }));
}

// Daemon entrypoint when run directly
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("fake_opskeeper.ts");
if (isMain) {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith("--port"));
  const port = portArg ? Number(portArg.split("=")[1] ?? args[args.indexOf(portArg) + 1]) : 4117;
  startFakeOpsKeeper({ port }).then((ctx) => {
    // eslint-disable-next-line no-console
    console.log(`[fake-opskeeper] listening on ${ctx.url}`);
  });
}
