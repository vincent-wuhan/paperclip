// Normal-path smoke (category: normal)
// Asserts the happy path on every contract endpoint — used as both a baseline
// for the failure-path suite and a Phase A reference for client wiring.

import test from "node:test";
import assert from "node:assert/strict";
import { startFakeOpsKeeper } from "../fake_opskeeper";
import { OpsKeeperClient } from "../client";

test("normal — list, detail, archive, approval create/get round-trips through fake opskeeper", async () => {
  const ctx = await startFakeOpsKeeper({ port: 0 });
  try {
    const readonly = new OpsKeeperClient({ baseUrl: ctx.url, token: "ok-readonly-a1b2c3d4" });
    const approval = new OpsKeeperClient({ baseUrl: ctx.url, token: "ok-approval-x9y8z7w6" });

    const list = await readonly.listIncidents();
    assert.ok(list, "list returns");
    assert.equal(list.code, 200, "list returns 200");
    const incidents = (list.body?.incidents ?? []) as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(incidents) && incidents.length >= 1, "at least one incident");
    assert.ok(typeof list.trace_id === "string" && list.trace_id.length > 0, "list carries trace_id");
    assert.ok(readonly.state.cursor, "cursor advances on 2xx");

    const detail = await readonly.fetch<{ incident: Record<string, unknown> }>("/api/v1/incidents/inc-1001", { method: "GET" });
    assert.equal(detail?.code, 200, "detail is 200");
    assert.ok(detail?.body?.incident, "detail carries incident payload");

    const archived = await readonly.archive("inc-1001");
    assert.equal(archived.code, 200, "archive code=200");
    assert.equal(archived.side_effect, "archived", "archive side_effect=archived");
    assert.equal(readonly.state.archives, 1);

    const apr = await approval.createApproval("inc-1002");
    assert.equal(apr.code, 201, "approval create returns 201");
    assert.ok(apr.body?.id, "approval has id");
    const got = await approval.fetch<{ status: string }>(`/api/v1/approvals/${apr.body?.id}`, { method: "GET" });
    assert.equal(got?.code, 200, "approval get returns 200");
    assert.equal((got?.body as { status: string } | undefined)?.status, "pending");
  } finally {
    await ctx.close();
  }
});
