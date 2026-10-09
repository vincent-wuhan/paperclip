import {
  definePlugin,
  runWorker,
  type EnvSecretRefBinding,
  type PaperclipPlugin,
  type PluginContext
} from "@paperclipai/plugin-sdk";
import { OpsKeeperReadOnlyClient } from "./client.js";
import { EMPTY_MIRROR, syncOnce } from "./sync.js";
import { JOB_KEY, STATE_KEY } from "./constants.js";
import type { MirrorState, OpsKeeperPluginConfig } from "./types.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSecretRef(value: unknown): value is EnvSecretRefBinding {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return item.type === "secret_ref" && typeof item.secretId === "string";
}

function requireCompanyId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("companyId is required");
  return value;
}

async function readConfig(ctx: PluginContext, companyId: string): Promise<OpsKeeperPluginConfig> {
  const config = await ctx.config.get(companyId);
  if (typeof config.opskeeperBaseUrl !== "string") throw new Error("opskeeperBaseUrl is required");
  if (config.opskeeperTokenRef !== undefined && !isSecretRef(config.opskeeperTokenRef)) {
    throw new Error("opskeeperTokenRef must be a secret reference");
  }
  return {
    opskeeperBaseUrl: config.opskeeperBaseUrl,
    opskeeperTokenRef: isSecretRef(config.opskeeperTokenRef) ? config.opskeeperTokenRef : undefined,
    allowedHosts: Array.isArray(config.allowedHosts)
      ? config.allowedHosts.filter((host): host is string => typeof host === "string")
      : undefined,
    allowInsecureHttp: config.allowInsecureHttp === true,
    requestTimeoutMs: typeof config.requestTimeoutMs === "number" ? config.requestTimeoutMs : undefined,
    staleAfterMs: typeof config.staleAfterMs === "number" ? config.staleAfterMs : undefined
  };
}

async function readMirror(ctx: PluginContext, companyId: string, staleAfterMs = 120_000): Promise<MirrorState> {
  const value = await ctx.state.get({ scopeKind: "company", scopeId: companyId, stateKey: STATE_KEY });
  if (value === null || typeof value !== "object") return { ...EMPTY_MIRROR };
  const item = value as Partial<MirrorState>;
  const incidents = Array.isArray(item.incidents) ? item.incidents : [];
  const detailRecord = item.details && typeof item.details === "object" && !Array.isArray(item.details) ? item.details : {};
  const details = Object.fromEntries(
    Object.entries(detailRecord).filter(([, detail]) => typeof detail === "object" && detail !== null)
  );
  const lastSuccessAt = typeof item.lastSuccessAt === "string" ? item.lastSuccessAt : null;
  const ageMs = lastSuccessAt ? Date.now() - Date.parse(lastSuccessAt) : Number.POSITIVE_INFINITY;
  return {
    ...EMPTY_MIRROR,
    cursor: typeof item.cursor === "string" ? item.cursor : null,
    lastSuccessAt,
    lastAttemptAt: typeof item.lastAttemptAt === "string" ? item.lastAttemptAt : null,
    lastError: typeof item.lastError === "string" ? item.lastError : null,
    stale: item.stale === true || !Number.isFinite(ageMs) || ageMs > staleAfterMs,
    incidents,
    details
  };
}

async function readConfiguredMirror(ctx: PluginContext, companyId: string): Promise<MirrorState> {
  const config = await readConfig(ctx, companyId);
  return await readMirror(ctx, companyId, config.staleAfterMs);
}

async function syncCompany(ctx: PluginContext, companyId: string): Promise<MirrorState> {
  const config = await readConfig(ctx, companyId);
  const token = config.opskeeperTokenRef
    ? await ctx.secrets.resolve(config.opskeeperTokenRef, { companyId })
    : undefined;
  const client = new OpsKeeperReadOnlyClient({
    baseUrl: config.opskeeperBaseUrl,
    token,
    timeoutMs: config.requestTimeoutMs,
    allowedHosts: config.allowedHosts,
    allowInsecureHttp: config.allowInsecureHttp,
    fetchImpl: (url, init) => ctx.http.fetch(url.toString(), init)
  });
  const previous = await readMirror(ctx, companyId, config.staleAfterMs);
  const result = await syncOnce(client, previous);
  await ctx.state.set({ scopeKind: "company", scopeId: companyId, stateKey: STATE_KEY }, result.state);
  if (result.errored) ctx.logger.warn("OpsKeeper read-only sync failed", { companyId, error: result.error });
  return result.state;
}

async function syncAllCompanies(ctx: PluginContext): Promise<void> {
  let offset = 0;
  let pageSize = 100;
  do {
    const companies = await ctx.companies.list({ limit: pageSize, offset });
    for (const company of companies) {
      try {
        await syncCompany(ctx, company.id);
      } catch (error) {
        ctx.logger.warn("OpsKeeper company sync failed", {
          companyId: company.id,
          error: errorMessage(error)
        });
      }
    }
    offset += companies.length;
    pageSize = companies.length;
  } while (pageSize === 100);
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx: PluginContext) {
    ctx.jobs.register(JOB_KEY, async () => {
      await syncAllCompanies(ctx);
    });

    ctx.data.register("opskeeper-incidents", async (params) => {
      const companyId = requireCompanyId(params.companyId);
      return await readConfiguredMirror(ctx, companyId);
    });

    ctx.actions.register("opskeeper-resync", async (params) => {
      const companyId = requireCompanyId(params.companyId);
      return await syncCompany(ctx, companyId);
    });

    ctx.tools.register("opskeeper_incident_lookup", {
      displayName: "OpsKeeper incident lookup",
      description: "Search the read-only Paperclip mirror of OpsKeeper incidents.",
      parametersSchema: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          query: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 100 }
        },
        required: ["companyId"]
      }
    }, async (params) => {
      const input = params as { companyId?: unknown; query?: unknown; limit?: unknown };
      const companyId = requireCompanyId(input.companyId);
      const query = typeof input.query === "string" ? input.query.toLowerCase() : "";
      const limit = typeof input.limit === "number" ? Math.min(100, Math.max(1, input.limit)) : 20;
      const mirror = await readConfiguredMirror(ctx, companyId);
      const incidents = mirror.incidents
        .filter((incident) => !query || `${incident.id} ${incident.title} ${incident.severity} ${incident.state}`.toLowerCase().includes(query))
        .slice(0, limit);
      return { content: JSON.stringify({ incidents, stale: mirror.stale }), data: { incidents, stale: mirror.stale } };
    });

    ctx.tools.register("opskeeper_incident_detail", {
      displayName: "OpsKeeper incident detail",
      description: "Read one incident and its evidence from the local mirror.",
      parametersSchema: {
        type: "object",
        properties: { companyId: { type: "string" }, incidentId: { type: "string" } },
        required: ["companyId", "incidentId"]
      }
    }, async (params) => {
      const input = params as { companyId?: unknown; incidentId?: unknown };
      const companyId = requireCompanyId(input.companyId);
      if (typeof input.incidentId !== "string") throw new Error("incidentId is required");
      const mirror = await readConfiguredMirror(ctx, companyId);
      const detail = mirror.details[input.incidentId];
      if (!detail) return { error: "Incident is not present in the local mirror" };
      return { content: JSON.stringify(detail), data: detail };
    });

    ctx.tools.register("opskeeper_sync_state", {
      displayName: "OpsKeeper sync state",
      description: "Read cursor and freshness metadata for the OpsKeeper mirror.",
      parametersSchema: {
        type: "object",
        properties: { companyId: { type: "string" } },
        required: ["companyId"]
      }
    }, async (params) => {
      const companyId = requireCompanyId((params as { companyId?: unknown }).companyId);
      const { incidents, details, ...metadata } = await readConfiguredMirror(ctx, companyId);
      return { content: JSON.stringify(metadata), data: metadata };
    });
  },

  async onValidateConfig(config) {
    const errors: string[] = [];
    try {
      const url = new URL(String(config.opskeeperBaseUrl ?? ""));
      if (url.protocol !== "https:" && config.allowInsecureHttp !== true) errors.push("opskeeperBaseUrl must use HTTPS");
      const allowedHosts = Array.isArray(config.allowedHosts) ? config.allowedHosts : [url.hostname];
      if (!allowedHosts.includes(url.hostname)) errors.push("opskeeperBaseUrl host is not allowed");
    } catch {
      errors.push("opskeeperBaseUrl must be a valid URL");
    }
    if (config.opskeeperTokenRef !== undefined && !isSecretRef(config.opskeeperTokenRef)) {
      errors.push("opskeeperTokenRef must use a secret reference");
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  },

  async onHealth() {
    return { status: "ok", message: "OpsKeeper read-only mirror worker is running" };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
