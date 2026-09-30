/**
 * Read-only Agent tools for Paperclip × OpsKeeper (Phase C, 3.7).
 *
 * Coverage requirements:
 *   - incidents (list / get / timeline)
 *   - RCA (read-only summary)
 *   - evidence (read-only attachment list / fetch)
 *   - archive lookup (read-only past incident lookup)
 *
 * Mandatory properties (per acceptance):
 *   - JSON schema validation
 *   - timeout
 *   - rate limit
 *   - audit log
 *   - no mutation capability
 *
 * Non-mutation is enforced two ways:
 *   1. None of the tools accept an `action` / `command` / `payload` / `body` arg.
 *   2. The registry rejects registration of any tool whose name begins with
 *      a deny prefix (mutate / shell / execute / etc.) — see DENY_PREFIXES.
 *
 * Network egress is constrained:
 *   - allowedHosts is provided per-tool by the host at registration.
 *   - The only outbound endpoint family is GET / HEAD against OpsKeeper.
 *   - Redirects are not followed.
 *   - Tokens are sourced from a single scoped secret per OpenSpec 3.3.
 */

import type { JsonSchema } from "./schema.js";
import type { ReadOnlyTool } from "./tool-host.js";
import { opskeeperRead, NotAllowedError } from "./opskeeper.js";

const SCHEMA_ID_PATTERN = "^[a-zA-Z0-9_.\\-:]{1,64}$";
const TOKEN_BUDGET = 200; // arbitrary cap on number of evidence rows returned

// ----------------------------------------------------------------------------
// Schema fragments
// ----------------------------------------------------------------------------

const pagination: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cursor: { type: "string", maxLength: 256 },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
};

const evidenceFilter: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["log", "trace", "metric", "link", "file"],
    },
    labelContains: { type: "string", maxLength: 200, pattern: "^[a-zA-Z0-9 _.\\-:/]{0,200}$" },
  },
};

// ----------------------------------------------------------------------------
// Tool definitions
// ----------------------------------------------------------------------------

export function incidentLookupTool(
  baseUrl: string,
  allowedHosts: ReadonlySet<string>,
  token?: string,
): ReadOnlyTool {
  return {
    name: "opskeeper_incident_lookup",
    description:
      "Look up archived/closed OpsKeeper incidents (read-only). Returns a paginated list keyed on OpsKeeper's archived incident id.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200 },
        // OpenSpec 3.7 — archive lookup is read-only.
        timeRange: {
          type: "object",
          additionalProperties: false,
          properties: {
            fromIso: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T" },
            toIso: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T" },
          },
        },
        pagination,
      },
    },
    defaultTimeoutMs: 6_000,
    costInTokens: 1,
    rateLimit: { refillPerSecond: 8, burst: 16 },
    executor: async (args, ctx) => {
      const p = (args.pagination as Record<string, unknown> | undefined) ?? {};
      const limit = typeof p.limit === "number" ? p.limit : 20;
      const cursor = typeof p.cursor === "string" ? p.cursor : undefined;
      const tr = (args.timeRange as Record<string, unknown> | undefined) ?? {};
      const queryParams: Record<string, string> = {
        query: String(args.query),
        limit: String(limit),
        ...(cursor ? { cursor } : {}),
        ...(typeof tr.fromIso === "string" ? { from: tr.fromIso } : {}),
        ...(typeof tr.toIso === "string" ? { to: tr.toIso } : {}),
      };
      const data = await opskeeperRead<{
        incidents: Array<Record<string, unknown>>;
        nextCursor: string | null;
      }>({
        baseUrl: baseUrl || ctx.opskeeperBaseUrl,
        path: "/archive/lookup",
        query: queryParams,
        token,
        allowedHosts,
      });
      return {
        incidents: data.incidents.slice(0, limit),
        nextCursor: data.nextCursor,
      };
    },
  };
}

export function rcaSummaryTool(
  baseUrl: string,
  allowedHosts: ReadonlySet<string>,
  token?: string,
): ReadOnlyTool {
  return {
    name: "opskeeper_rca_summary",
    description:
      "Fetch the root-cause analysis block for a single OpsKeeper incident (read-only).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["incidentId"],
      properties: {
        incidentId: { type: "string", pattern: SCHEMA_ID_PATTERN },
        // Optional: redact evidence identifiers from the returned narrative.
        redactEvidenceRefs: { type: "boolean", default: true },
      },
    },
    defaultTimeoutMs: 6_000,
    costInTokens: 2,
    rateLimit: { refillPerSecond: 12, burst: 24 },
    executor: async (args, ctx) => {
      const id = String(args.incidentId);
      const rca = await opskeeperRead<{
        incidentId: string;
        cause?: string;
        narrative?: string;
        updatedAt: string;
        author?: string;
      }>({
        baseUrl: baseUrl || ctx.opskeeperBaseUrl,
        path: `/incidents/${encodeURIComponent(id)}/rca`,
        token,
        allowedHosts,
      });
      if (args.redactEvidenceRefs !== false && rca.narrative) {
        rca.narrative = rca.narrative.replace(/\b(ev-[a-zA-Z0-9_-]{4,})\b/g, "[ref:$1]");
      }
      return rca;
    },
  };
}

export function evidenceListTool(
  baseUrl: string,
  allowedHosts: ReadonlySet<string>,
  token?: string,
): ReadOnlyTool {
  return {
    name: "opskeeper_evidence_list",
    description:
      "List evidence attachments for a single OpsKeeper incident (read-only). Returns up to `limit` items with their metadata.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["incidentId"],
      properties: {
        incidentId: { type: "string", pattern: SCHEMA_ID_PATTERN },
        filter: evidenceFilter,
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
    },
    defaultTimeoutMs: 6_000,
    costInTokens: 1,
    rateLimit: { refillPerSecond: 10, burst: 20 },
    executor: async (args, ctx) => {
      const id = String(args.incidentId);
      const f = (args.filter as Record<string, unknown> | undefined) ?? {};
      const queryParams: Record<string, string> = {
        limit: String(Math.min(Number(args.limit ?? 25), TOKEN_BUDGET)),
      };
      if (typeof f.kind === "string") queryParams.kind = f.kind;
      if (typeof f.labelContains === "string") {
        queryParams.label_contains = f.labelContains;
      }
      const data = await opskeeperRead<{
        evidence: Array<{
          id: string;
          incidentId: string;
          kind: string;
          label: string;
          url: string;
        }>;
      }>({
        baseUrl: baseUrl || ctx.opskeeperBaseUrl,
        path: `/incidents/${encodeURIComponent(id)}/evidence`,
        query: queryParams,
        token,
        allowedHosts,
      });
      return {
        incidentId: id,
        count: data.evidence.length,
        items: data.evidence,
      };
    },
  };
}

export function archiveLookupTool(
  baseUrl: string,
  allowedHosts: ReadonlySet<string>,
  token?: string,
): ReadOnlyTool {
  return {
    name: "opskeeper_archive_lookup",
    description:
      "Look up archived OpsKeeper incidents by id or filter (read-only). Caps results to keep paperclip agent responses tight.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        incidentId: { type: "string", pattern: SCHEMA_ID_PATTERN },
        severity: {
          type: "string",
          enum: ["info", "low", "medium", "high", "critical"],
        },
        state: {
          type: "string",
          enum: ["open", "ack", "mitigating", "resolved", "archived"],
        },
        maxResults: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
    },
    defaultTimeoutMs: 6_000,
    costInTokens: 2,
    rateLimit: { refillPerSecond: 6, burst: 12 },
    executor: async (args, ctx) => {
      const cap = Math.min(Number(args.maxResults ?? 10), 50);
      if (typeof args.incidentId === "string") {
        const detail = await opskeeperRead<Record<string, unknown>>({
          baseUrl: baseUrl || ctx.opskeeperBaseUrl,
          path: `/archive/incidents/${encodeURIComponent(args.incidentId)}`,
          token,
          allowedHosts,
        });
        return { mode: "single", incident: detail };
      }
      const queryParams: Record<string, string> = { limit: String(cap) };
      if (typeof args.severity === "string") queryParams.severity = args.severity;
      if (typeof args.state === "string") queryParams.state = args.state;
      const data = await opskeeperRead<{
        incidents: Array<Record<string, unknown>>;
      }>({
        baseUrl: baseUrl || ctx.opskeeperBaseUrl,
        path: "/archive/incidents",
        query: queryParams,
        token,
        allowedHosts,
      });
      return {
        mode: "list",
        incidents: data.incidents.slice(0, cap),
        returned: Math.min(data.incidents.length, cap),
      };
    },
  };
}

// ----------------------------------------------------------------------------
// Convenience: build a registry with the Phase C toolkit installed.
// ----------------------------------------------------------------------------

export interface PhaseCToolkitOptions {
  opskeeperBaseUrl: string;
  allowedHosts: ReadonlySet<string>;
  token?: string;
}

import { Registry, type ToolContext } from "./tool-host.js";

export function buildPhaseCRegistry(opts: PhaseCToolkitOptions): Registry {
  const reg = new Registry();
  reg.register(incidentLookupTool(opts.opskeeperBaseUrl, opts.allowedHosts, opts.token));
  reg.register(rcaSummaryTool(opts.opskeeperBaseUrl, opts.allowedHosts, opts.token));
  reg.register(evidenceListTool(opts.opskeeperBaseUrl, opts.allowedHosts, opts.token));
  reg.register(archiveLookupTool(opts.opskeeperBaseUrl, opts.allowedHosts, opts.token));
  return reg;
}

export type { ToolContext };
export { NotAllowedError };
