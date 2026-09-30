import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPhaseCRegistry } from "../src/agent-tools.ts";
import { AuditLog } from "../src/audit-log.ts";

const HOSTS = new Set<string>(["opskeeper.local"]);

test("integration: buildPhaseCRegistry exposes four tools with names that all start with opskeeper_", () => {
  const reg = buildPhaseCRegistry({
    opskeeperBaseUrl: "https://opskeeper.local",
    allowedHosts: HOSTS,
  });
  const names = reg.list();
  assert.equal(names.length, 4);
  for (const n of names) {
    assert.ok(n.startsWith("opskeeper_"), `expected opskeeper_ prefix, got ${n}`);
  }
  for (const n of names) {
    // None of the deny-prefixes leak in.
    assert.ok(!["execute", "shell", "mutate", "fix"].some((d) => n.startsWith(d)));
  }
});

test("integration: rca_summary enforces schema and rejects bad ids", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const audit = new AuditLog({ sink: (e) => captured.push(e as unknown as Record<string, unknown>) });
  const reg = buildPhaseCRegistry({
    opskeeperBaseUrl: "https://opskeeper.local",
    allowedHosts: HOSTS,
  });
  // @ts-expect-error pass through to registry runtime
  reg["audit"] = audit; // not strictly necessary; we only need the existing audit
  const bad = await reg.call({
    toolName: "opskeeper_rca_summary",
    principalId: "u1",
    args: { incidentId: "no spaces allowed" },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.outcome, "rejected_schema");
});

test("integration: registry rejects calls to mutation tools at registration time (DENY_PREFIXES)", () => {
  const reg = buildPhaseCRegistry({
    opskeeperBaseUrl: "https://opskeeper.local",
    allowedHosts: HOSTS,
  });
  // Try to register a mutation tool — must be rejected at registration.
  let threw = false;
  try {
    reg.register({
      name: "execute-fix-script",
      description: "should not register",
      inputSchema: { type: "object" },
      executor: async () => ({}),
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "DENY_PREFIXES must reject mutation tool names");
});
