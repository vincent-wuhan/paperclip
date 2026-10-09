import type { EnvSecretRefBinding } from "@paperclipai/plugin-sdk";

export interface OpsKeeperIncident {
  id: string;
  title: string;
  severity: string;
  state: string;
  openedAt: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  owner?: string | null;
  opskeeperUrl: string;
  payloadHash: string;
}

export interface OpsKeeperTimelineEntry {
  id?: string;
  occurredAt: string;
  actor?: string;
  kind?: string;
  message: string;
}

export interface OpsKeeperEvidence {
  id?: string;
  kind?: string;
  label: string;
  url: string;
}

export interface OpsKeeperRca {
  cause?: string;
  narrative?: string;
  author?: string | null;
  updatedAt?: string;
}

export interface OpsKeeperIncidentDetail extends OpsKeeperIncident {
  summary?: string;
  timeline: OpsKeeperTimelineEntry[];
  rca?: OpsKeeperRca | null;
  evidence: OpsKeeperEvidence[];
}

export interface MirrorState {
  cursor: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  stale: boolean;
  incidents: OpsKeeperIncident[];
  details: Record<string, OpsKeeperIncidentDetail>;
}

export interface SyncResult {
  upserted: number;
  unchanged: number;
  errored: boolean;
  error?: string;
  nextCursor: string | null;
}

export interface OpsKeeperPluginConfig {
  opskeeperBaseUrl: string;
  opskeeperTokenRef?: EnvSecretRefBinding;
  allowedHosts?: string[];
  allowInsecureHttp?: boolean;
  requestTimeoutMs?: number;
  staleAfterMs?: number;
}
