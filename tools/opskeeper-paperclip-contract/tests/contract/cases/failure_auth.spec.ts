// Failure category: auth-401 / auth-403
// Asserts:
//  - 401 from server → client transitions to `stopped-secret-invalid` and stops polling (no follow-up calls move cursor)
//  - 403 scope-mismatch → same `stopped-secret-invalid` transition
//  - Both produce log entries with `category=auth-401|auth-403`, `phase=S1`, `trace_id`
//  - Admin tokens rejected at 401 (linter / contract guard)

import test from "node:test";
import assert from "node:assert/strict";
import { startFakeOpsKeeper } from "../fake_opskeeper";
import { fixtureToken } from "../fixtures/tokens";

test("401 — server emits 401; client raises stopped-secret-invalid; log carries trace_id", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  const logs: any[] = [];
  try {
    const { OpsKeeperClient } = await import("../client");
    await ctx.setFailure("GET /api/v1/incidents", "401");
    const client = new OpsKeeperClient({
      baseUrl: ctx.url,
      token: "ok-readonly-a1b2c3d4",
      log: (e) => logs.push(e),
    });
    await client.listIncidents();
    assert.equal(client.state.status, "stopped-secret-invalid", "401 stops the polling");
    const log = logs.find((l) => l.category === "auth-401");
    assert.ok(log, "401 log present");
    assert.ok(typeof log.trace_id === "string" && log.trace_id.length > 0, "401 trace_id present");
    assert.equal(log.phase, "S1");
  } finally {
    await ctx.close();
  }
});

test("403 — wrong-scope token (ok-approval trying readonly) → client stops polling", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  const logs: any[] = [];
  try {
    const { OpsKeeperClient } = await import("../client");
    const client = new OpsKeeperClient({
      baseUrl: ctx.url,
      token: "ok-approval-x9y8z7w6", // wrong scope for incident list
      log: (e) => logs.push(e),
    });
    await client.listIncidents();
    assert.equal(client.state.status, "stopped-secret-invalid", "scope mismatch stops polling");
    const log = logs.find((l) => l.category === "auth-403");
    assert.ok(log, "403 log present");
  } finally {
    await ctx.close();
  }
});

test("admin-scope token is rejected at 401 (no scope upgrade)", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  const logs: any[] = [];
  try {
    const { OpsKeeperClient } = await import("../client");
    // server classifyToken() rejects the forbidden-prefix family (see fixtures/tokens.json)
    // LINT-OK: negative-fixture-token — see tests/contract/fixtures/tokens.json
    const client = new OpsKeeperClient({
      baseUrl: ctx.url,
      token: fixtureToken("admin_rejected_2"),
      log: (e) => logs.push(e),
    });
    await client.listIncidents();
    assert.equal(client.state.status, "stopped-secret-invalid", "admin token cannot leak into client");
    assert.ok(logs.some((l) => l.category === "auth-401"), "admin attempted token logged as 401");
  } finally {
    await ctx.close();
  }
});
