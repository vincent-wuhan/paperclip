// Failure category: idempotent-conflict-409
// Asserts:
//  - re-archiving an already-archived incident returns 409; the client records
//    `state.conflict_dedup` and does NOT inflate `state.archives`
//  - duplicate approvals also don't pollute dedup state (out of scope for archive but logged)
//  - log entries carry `category=idempotent-409`, `trace_id`, `phase=S1`

import test from "node:test";
import assert from "node:assert/strict";
import { startFakeOpsKeeper } from "../fake_opskeeper";
import { OpsKeeperClient } from "../client";

test("409 — duplicate archive increments dedup, not archives count, log carries trace_id", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  const logs: any[] = [];
  try {
    const client = new OpsKeeperClient({
      baseUrl: ctx.url,
      token: "ok-readonly-a1b2c3d4",
      log: (e) => logs.push(e),
    });

    // First archive — success.
    const first = await client.archive("inc-1001");
    assert.equal(first.code, 200, "first archive returns 200");
    assert.equal(first.side_effect, "archived", "first archive side_effect=archived");
    assert.equal(client.state.archives, 1, "archives=1");
    assert.equal(client.state.conflict_dedup, 0, "dedup=0 after first");

    // Second archive — server treats as 409 (server default behavior on already-archived).
    logs.length = 0;
    const second = await client.archive("inc-1001");
    assert.equal(second.code, 409, "second archive returns 409");
    assert.equal(second.side_effect, "idempotent", "second archive side_effect=idempotent");
    assert.equal(client.state.archives, 1, "archives count NOT incremented");
    assert.equal(client.state.conflict_dedup, 1, "dedup count incremented");

    const log = logs.find((l) => l.category === "idempotent-409");
    assert.ok(log, "duplicate logged with idempotent-409 category");
    assert.ok(typeof log.trace_id === "string" && log.trace_id.length > 0, "409 trace_id present");
    assert.equal(log.phase, "S1");
  } finally {
    await ctx.close();
  }
});

test("409 — explicit failure mode set returns 409 with stable contract", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  try {
    await ctx.setFailure("POST /api/v1/incidents/inc-1002/archive", "409");
    const client = new OpsKeeperClient({ baseUrl: ctx.url, token: "ok-readonly-a1b2c3d4" });
    const r = await client.archive("inc-1002");
    assert.equal(r.code, 409, "control-plane 409 surfaces correctly");
    assert.equal(r.side_effect, "idempotent", "control-plane 409 side_effect=idempotent");
  } finally {
    await ctx.close();
  }
});
