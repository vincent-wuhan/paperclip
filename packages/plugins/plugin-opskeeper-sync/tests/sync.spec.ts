import { describe, expect, it } from "vitest";
import { OpsKeeperReadOnlyClient } from "../src/client.js";
import { EMPTY_MIRROR, syncOnce } from "../src/sync";
import type { OpsKeeperIncident, OpsKeeperIncidentDetail } from "../src/types";

const incident: OpsKeeperIncident = {
  id: "incident-1",
  title: "Database saturation",
  severity: "high",
  state: "investigating",
  openedAt: "2026-10-09T00:00:00Z",
  updatedAt: "2026-10-09T00:05:00Z",
  resolvedAt: null,
  owner: "sre",
  opskeeperUrl: "https://opskeeper.example/incidents/incident-1",
  payloadHash: "hash-1"
};

const detail: OpsKeeperIncidentDetail = {
  ...incident,
  summary: "Connection pool is exhausted",
  timeline: [{ occurredAt: "2026-10-09T00:01:00Z", actor: "investigator", kind: "evidence", message: "Pool metrics collected" }],
  rca: { cause: "pool leak", narrative: "A transaction did not release its connection." },
  evidence: [{ kind: "metric", label: "Pool usage", url: "https://opskeeper.example/evidence/pool" }]
};

function fakeFetch() {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe("GET");
    const url = new URL(String(_input));
    if (url.pathname.endsWith("/incidents")) {
      return new Response(JSON.stringify({ incidents: [incident], nextCursor: "cursor-2" }), { status: 200 });
    }
    return new Response(JSON.stringify(detail), { status: 200 });
  };
}

describe("OpsKeeper read-only sync", () => {
  it("rejects non-allowed HTTP endpoints before fetching", () => {
    expect(() => new OpsKeeperReadOnlyClient({
      baseUrl: "http://127.0.0.1:8090",
      fetchImpl: fakeFetch()
    })).toThrow("HTTPS");
  });

  it("filters incident records with unsafe deep links", async () => {
    const unsafe = {
      ...incident,
      id: "incident-unsafe",
      opskeeperUrl: "javascript:alert(1)"
    };
    const client = new OpsKeeperReadOnlyClient({
      baseUrl: "https://opskeeper.example",
      allowedHosts: ["opskeeper.example"],
      fetchImpl: async () => new Response(JSON.stringify({ incidents: [unsafe] }), { status: 200 })
    });
    const result = await syncOnce(client, { ...EMPTY_MIRROR });
    expect(result.state.incidents).toHaveLength(0);
  });

  it("mirrors incidents idempotently and preserves errors", async () => {
    const client = new OpsKeeperReadOnlyClient({
      baseUrl: "https://opskeeper.example",
      allowedHosts: ["opskeeper.example"],
      fetchImpl: fakeFetch()
    });
    const first = await syncOnce(client, { ...EMPTY_MIRROR });
    expect(first).toMatchObject({ upserted: 1, unchanged: 0, errored: false });
    expect(first.state.cursor).toBe("cursor-2");
    const second = await syncOnce(client, first.state);
    expect(second).toMatchObject({ upserted: 0, unchanged: 1, errored: false });

    const failing = new OpsKeeperReadOnlyClient({
      baseUrl: "https://opskeeper.example",
      allowedHosts: ["opskeeper.example"],
      fetchImpl: async () => new Response("upstream unavailable", { status: 503 })
    });
    const failed = await syncOnce(failing, second.state);
    expect(failed.errored).toBe(true);
    expect(failed.state.stale).toBe(true);
    expect(failed.state.incidents).toHaveLength(1);
    expect(failed.state.lastError).toContain("503");
  });
});
