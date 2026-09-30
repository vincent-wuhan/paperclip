// Failure category: server-error-5xx
// Drives every endpoint matrix entry into a 5xx state and asserts:
//  - the client surfaces a 5xx code, does NOT mutate cursor,
//  - logs include `trace_id` + `category=server-error-5xx` + `phase=S1`.
// All endpoints in ADR-3 matrix are exercised.

import test from "node:test";
import assert from "node:assert/strict";
import { startFakeOpsKeeper } from "../fake_opskeeper";
import { OpsKeeperClient } from "../client";

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/incidents", scope: "ok-readonly", token: "ok-readonly-a1b2c3d4" },
  { method: "GET", path: "/api/v1/incidents/inc-1001", scope: "ok-readonly", token: "ok-readonly-a1b2c3d4" },
  { method: "POST", path: "/api/v1/incidents/inc-1001/archive", scope: "ok-readonly", token: "ok-readonly-a1b2c3d4" },
  { method: "POST", path: "/api/v1/approvals", scope: "ok-approval", token: "ok-approval-x9y8z7w6" },
  { method: "GET", path: "/api/v1/approvals/apr-test", scope: "ok-approval", token: "ok-approval-x9y8z7w6" },
] as const;

test("5xx — every endpoint surfaces 5xx, no cursor pollution, log carries trace_id", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  const logs: any[] = [];
  try {
    for (const ep of ENDPOINTS) {
      await ctx.reset();
      const client = new OpsKeeperClient({ baseUrl: ctx.url, token: ep.token, log: (e) => logs.push(e) });
      const beforeCursor = client.state.cursor;

      await ctx.setFailure(`${ep.method} ${ep.path}`, "5xx");

      let responseCode = 0;
      if (ep.method === "GET" && ep.path === "/api/v1/incidents") {
        const r = await client.listIncidents();
        responseCode = r?.code ?? 0;
      } else if (ep.method === "POST" && ep.path.endsWith("/archive")) {
        const r = await client.archive("inc-1001");
        responseCode = r?.code ?? 0;
      } else if (ep.method === "POST" && ep.path === "/api/v1/approvals") {
        const r = await client.createApproval("inc-1001");
        responseCode = r?.code ?? 0;
      } else {
        // detail / approval get / generic
        const r = await client.fetch(ep.path, { method: ep.method });
        responseCode = r?.code ?? 0;
      }

      assert.equal(responseCode, 503, `${ep.method} ${ep.path} returns 503`);
      assert.equal(client.state.cursor, beforeCursor, `cursor unchanged after 5xx on ${ep.path}`);
      const fivexxLog = logs.find((l) => l.category === "server-error-5xx");
      assert.ok(fivexxLog, `expected a 5xx log entry for ${ep.path}`);
      assert.ok(typeof fivexxLog.trace_id === "string" && fivexxLog.trace_id.length > 0, "log has trace_id");
      assert.equal(fivexxLog.phase, "S1", "log has phase");
      logs.length = 0;
    }
  } finally {
    await ctx.close();
  }
});
