// Failure category: timeout
// Sets client timeout shorter than server response delay and asserts:
//  - status flips to `stale`, no cursor movement, log carries `category=timeout`.

import test from "node:test";
import assert from "node:assert/strict";
import { startFakeOpsKeeper } from "../fake_opskeeper";
import { OpsKeeperClient } from "../client";

test("timeout — list and detail mark state stale, cursor not moved", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  const logs: any[] = [];
  try {
    await ctx.setFailure("GET /api/v1/incidents", "timeout");
    const client = new OpsKeeperClient({
      baseUrl: ctx.url,
      token: "ok-readonly-a1b2c3d4",
      timeoutMs: 250,
      log: (e) => logs.push(e),
    });
    const beforeCursor = client.state.cursor;

    await client.listIncidents();

    assert.equal(client.state.status, "stale", "client transitions to stale");
    assert.equal(client.state.cursor, beforeCursor, "cursor not moved");
    const tlog = logs.find((l) => l.category === "timeout");
    assert.ok(tlog, "timeout log present");
    assert.equal(tlog.phase, "S1", "phase recorded");
  } finally {
    await ctx.close();
  }
});

test("timeout — approval side reports stale too", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  const logs: any[] = [];
  try {
    await ctx.setFailure("POST /api/v1/approvals", "timeout");
    const client = new OpsKeeperClient({
      baseUrl: ctx.url,
      token: "ok-approval-x9y8z7w6",
      timeoutMs: 250,
      log: (e) => logs.push(e),
    });
    await client.createApproval("inc-1001");
    assert.equal(client.state.status, "stale", "approval path also stale");
    assert.ok(logs.some((l) => l.category === "timeout"), "approval timeout logged");
  } finally {
    await ctx.close();
  }
});
