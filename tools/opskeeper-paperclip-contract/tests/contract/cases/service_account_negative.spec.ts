// Service-account negative cases — supports AUDIT §A-2 / §A-4 / §D-1
// - Attempt to use admin-style token → rejected
// - Wrong-scope token → 403 from contract
// - Approval revoked (heartbeat drops token) → client must NOT issue new
//   approval requests without operator override (degrade signal verified)

import test from "node:test";
import assert from "node:assert/strict";
import { startFakeOpsKeeper } from "../fake_opskeeper";
import { OpsKeeperClient } from "../client";
import { fixtureToken } from "../fixtures/tokens";

test("admin token rejected as 401 — never reaches business endpoint", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  try {
    // LINT-OK: negative-fixture-token — see tests/contract/fixtures/tokens.json
    const client = new OpsKeeperClient({
      baseUrl: ctx.url,
      token: fixtureToken("admin_rejected_1"),
    });
    const r = await client.listIncidents();
    assert.ok(r, "list returns a parsed response");
    assert.equal(r.code, 401, "admin token refused at scope guard");
    assert.equal(client.state.status, "stopped-secret-invalid");
  } finally {
    await ctx.close();
  }
});

test("wrong-scope approval token cannot reach readonly endpoint", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  try {
    const client = new OpsKeeperClient({ baseUrl: ctx.url, token: "ok-approval-x9y8z7w6" });
    const r = await client.listIncidents();
    assert.ok(r, "list returns a parsed response");
    assert.equal(r.code, 403, "scope mismatch on endpoint returns 403");
    assert.equal(client.state.status, "stopped-secret-invalid");
  } finally {
    await ctx.close();
  }
});

test("approval revoked mid-flight — server starts returning 401; client stops issuing approvals", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  try {
    const client = new OpsKeeperClient({ baseUrl: ctx.url, token: "ok-approval-x9y8z7w6" });
    const before = await client.createApproval("inc-1001");
    assert.equal(before.code, 201, "approval works before revocation");

    await ctx.setFailure("POST /api/v1/approvals", "401");
    const after = await client.createApproval("inc-1001");
    assert.equal(after.code, 401, "approval now fails 401");
    assert.equal(client.state.status, "stopped-secret-invalid", "degrade signal recorded");
  } finally {
    await ctx.close();
  }
});
