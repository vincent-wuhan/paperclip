import { test } from "node:test";
import assert from "node:assert/strict";
import { Registry, PolicyError, DENY_PREFIXES } from "../src/tool-host.ts";
import { AuditLog } from "../src/audit-log.ts";

test("registry: rejects tool names that match deny prefixes", () => {
  const reg = new Registry();
  for (const deny of DENY_PREFIXES) {
    const tool = {
      name: `${deny}-something`,
      description: "should not register",
      inputSchema: { type: "object" },
      executor: async () => ({}),
    };
    assert.throws(() => reg.register(tool), PolicyError, `expected reject for prefix "${deny}"`);
  }
});

test("registry: rejects tools without schema", () => {
  const reg = new Registry();
  assert.throws(
    () =>
      reg.register({
        // @ts-expect-error - intentional missing-schema test
        name: "good-tool",
        description: "no schema",
        executor: async () => ({}),
      }),
    PolicyError,
  );
});

test("registry: happy path records audit on success", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const audit = new AuditLog({ sink: (e) => captured.push(e as unknown as Record<string, unknown>) });
  const reg = new Registry(audit);
  reg.register({
    name: "opskeeper_ping",
    description: "ping",
    inputSchema: { type: "object", additionalProperties: false },
    executor: async () => ({ ok: true }),
  });
  const res = await reg.call({ toolName: "opskeeper_ping", principalId: "p1", args: {} });
  assert.equal(res.ok, true);
  assert.equal(res.outcome, "ok");
  assert.equal(captured.length, 1);
  const entry = captured[0]!;
  assert.equal(entry.outcome, "ok");
  assert.equal(entry.tool, "opskeeper_ping");
});

test("registry: bad schema is rejected and audited as rejected_schema", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const audit = new AuditLog({ sink: (e) => captured.push(e as unknown as Record<string, unknown>) });
  const reg = new Registry(audit);
  reg.register({
    name: "opskeeper_echo",
    description: "echo",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string" } },
    },
    executor: async (args) => args,
  });
  const res = await reg.call({ toolName: "opskeeper_echo", principalId: "p1", args: { wrong: 1 } });
  assert.equal(res.ok, false);
  assert.equal(res.outcome, "rejected_schema");
  assert.ok(res.errorMessage && res.errorMessage.includes("missing required"));
  assert.equal(captured.length, 1);
  assert.equal(captured[0]!.outcome, "rejected_schema");
  // Executor should NOT have been called.
});

test("registry: rate-limited requests are audited as rejected_rate_limit", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const audit = new AuditLog({ sink: (e) => captured.push(e as unknown as Record<string, unknown>) });
  const reg = new Registry(audit);
  reg.register({
    name: "opskeeper_hot",
    description: "hot",
    inputSchema: { type: "object", additionalProperties: false },
    rateLimit: { refillPerSecond: 0.1, burst: 1 },
    executor: async () => ({}),
  });
  // Burst=1, refill=0.1/s. One succeeds, the rest rate-limit.
  const results: unknown[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await reg.call({ toolName: "opskeeper_hot", principalId: "p1", args: {} });
    results.push(r);
  }
  const allowed = results.filter((r) => (r as { ok: boolean }).ok).length;
  const rejected = results.filter((r) => (r as { outcome: string }).outcome === "rejected_rate_limit").length;
  assert.equal(allowed, 1);
  assert.ok(rejected >= 1);
  // Audit count should equal call count.
  assert.equal(captured.length, 5);
  const rateLimitedAudits = captured.filter((e) => e.outcome === "rejected_rate_limit").length;
  assert.ok(rateLimitedAudits >= 1);
});

test("registry: unknown tool is audited as rejected_policy", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const audit = new AuditLog({ sink: (e) => captured.push(e as unknown as Record<string, unknown>) });
  const reg = new Registry(audit);
  const res = await reg.call({ toolName: "opskeeper_does_not_exist", principalId: "p1", args: {} });
  assert.equal(res.ok, false);
  assert.equal(res.outcome, "rejected_policy");
  assert.equal(captured.length, 1);
  assert.equal(captured[0]!.outcome, "rejected_policy");
});
