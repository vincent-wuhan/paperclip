import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { JOB_KEY, PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "OpsKeeper Incident Mirror",
  description: "Polls OpsKeeper read-only APIs and shows incidents, timelines, RCA, evidence, and stale-state in Paperclip.",
  author: "OpsKeeper",
  categories: ["connector", "workspace", "ui"],
  capabilities: [
    "companies.read",
    "jobs.schedule",
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "agent.tools.register",
    "ui.dashboardWidget.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      opskeeperBaseUrl: {
        type: "string",
        title: "OpsKeeper API base URL",
        description: "HTTPS endpoint for the read-only scoped service account."
      },
      opskeeperTokenRef: {
        type: "object",
        title: "OpsKeeper read-only token secret reference",
        properties: {
          type: { type: "string", enum: ["secret_ref"] },
          secretId: { type: "string" },
          version: {
            oneOf: [
              { type: "number" },
              { type: "string", enum: ["latest"] }
            ]
          }
        },
        required: ["type", "secretId"],
        additionalProperties: false
      },
      allowedHosts: {
        type: "array",
        title: "Allowed OpsKeeper hosts",
        items: { type: "string" }
      },
      allowInsecureHttp: {
        type: "boolean",
        title: "Allow insecure HTTP (development only)",
        default: false
      },
      requestTimeoutMs: {
        type: "number",
        title: "Request timeout (ms)",
        default: 10000,
        minimum: 1000,
        maximum: 30000
      },
      staleAfterMs: {
        type: "number",
        title: "Stale threshold (ms)",
        default: 120000,
        minimum: 30000,
        maximum: 600000
      }
    },
    required: ["opskeeperBaseUrl"]
  },
  jobs: [
    {
      jobKey: JOB_KEY,
      displayName: "OpsKeeper read-only sync",
      description: "Polls incidents through the read-only OpsKeeper API and updates the Paperclip mirror.",
      schedule: "*/1 * * * *"
    }
  ],
  tools: [
    {
      name: "opskeeper_incident_lookup",
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
    },
    {
      name: "opskeeper_incident_detail",
      displayName: "OpsKeeper incident detail",
      description: "Read one incident, timeline, RCA summary, and evidence from the local mirror.",
      parametersSchema: {
        type: "object",
        properties: {
          companyId: { type: "string" },
          incidentId: { type: "string" }
        },
        required: ["companyId", "incidentId"]
      }
    },
    {
      name: "opskeeper_sync_state",
      displayName: "OpsKeeper sync state",
      description: "Read cursor, freshness, and last error for the OpsKeeper mirror.",
      parametersSchema: {
        type: "object",
        properties: { companyId: { type: "string" } },
        required: ["companyId"]
      }
    }
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "opskeeper-incident-mirror",
        displayName: "OpsKeeper Incidents",
        exportName: "OpsKeeperDashboardWidget"
      }
    ]
  }
};

export default manifest;
