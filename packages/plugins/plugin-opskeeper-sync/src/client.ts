import type { OpsKeeperIncident, OpsKeeperIncidentDetail } from "./types.js";

export interface OpsKeeperClientOptions {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  allowedHosts?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl: typeof fetch;
}

interface IncidentListResponse {
  incidents?: unknown;
  nextCursor?: unknown;
}

export class OpsKeeperApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(`OpsKeeper ${status}: ${message}`);
    this.name = "OpsKeeperApiError";
  }
}

export class OpsKeeperReadOnlyClient {
  private readonly baseUrl: URL;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly allowedHosts: Set<string>;
  private readonly allowInsecureHttp: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpsKeeperClientOptions) {
    this.baseUrl = new URL(options.baseUrl.replace(/\/+$/, ""));
    this.allowedHosts = new Set(options.allowedHosts ?? [this.baseUrl.hostname]);
    this.allowInsecureHttp = options.allowInsecureHttp ?? false;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl;
    this.validateBaseUrl();
  }

  async listIncidents(cursor: string | null): Promise<{ incidents: OpsKeeperIncident[]; nextCursor: string | null }> {
    const url = new URL(`${this.baseUrl.toString()}/incidents`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const payload = await this.getJson<IncidentListResponse>(url);
    const incidents = Array.isArray(payload.incidents) ? payload.incidents : [];
    return {
      incidents: incidents.filter((incident) => this.isIncident(incident)),
      nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null
    };
  }

  async getIncident(id: string): Promise<OpsKeeperIncidentDetail> {
    const url = new URL(`${this.baseUrl.toString()}/incidents/${encodeURIComponent(id)}`);
    const payload = await this.getJson<Record<string, unknown>>(url);
    if (!this.isIncident(payload) || !isIncidentDetail(payload)) throw new OpsKeeperApiError(422, "invalid incident detail");
    return payload;
  }

  private isIncident(value: unknown): value is OpsKeeperIncident {
    if (!isIncident(value)) return false;
    try {
      const url = new URL(value.opskeeperUrl);
      return url.protocol === "https:" || (url.protocol === "http:" && this.allowInsecureHttp);
    } catch {
      return false;
    }
  }

  private validateBaseUrl(): void {
    if (this.baseUrl.protocol !== "https:" && !this.allowInsecureHttp) {
      throw new Error("OpsKeeper base URL must use HTTPS");
    }
    if (!this.allowedHosts.has(this.baseUrl.hostname)) {
      throw new Error("OpsKeeper host is not in allowedHosts");
    }
  }

  private async getJson<T>(url: URL): Promise<T> {
    const response = await this.request(url);
    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 2000);
      throw new OpsKeeperApiError(response.status, text || response.statusText);
    }
    return await response.json() as T;
  }

  private async request(url: URL): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    try {
      return await this.fetchImpl(url.toString(), {
        method: "GET",
        headers,
        redirect: "error",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function isString(value: unknown, optional = false): value is string | undefined {
  return optional ? value === undefined || typeof value === "string" : typeof value === "string";
}

function isIncident(value: unknown): value is OpsKeeperIncident {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return isString(item.id) && isString(item.title) && isString(item.severity) &&
    isString(item.state) && isString(item.openedAt) && isString(item.opskeeperUrl) &&
    isString(item.payloadHash);
}

function isIncidentDetail(value: OpsKeeperIncident): value is OpsKeeperIncidentDetail {
  return Array.isArray((value as OpsKeeperIncidentDetail).timeline) &&
    Array.isArray((value as OpsKeeperIncidentDetail).evidence);
}
