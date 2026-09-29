import { test } from "node:test";
import assert from "node:assert/strict";
import { AuditLog, redact, canonicalize, digest } from "../src/audit-log.ts";

test("audit log: emits entries with monotonic prevHash chain", async () => {
  const sink: Array<Record<string, unknown>> = [];
  const log = new AuditLog({ sink: (e) => sink.push(e as unknown as Record<string, unknown>) });
  await log.record({
    tool: "t",
    principalId: "p",
    args: { id: "a" },
    outcome: "ok",
    durationMs: 1,
  });
  await log.record({
    tool: "t",
    principalId: "p",
    args: { id: "b" },
    outcome: "ok",
    durationMs: 1,
  });
  assert.equal(sink.length, 2);
  const e1 = sink[0];
  const e2 = sink[1];
  assert.equal(e1!.prevHash, "0".repeat(64));
  assert.equal(e2!.prevHash, e1!.hash);
});

test("audit log: redact scrubs token-like fields", () => {
  const v = redact({
    id: "ok",
    apiKey: "AKIASUPERSECRET",
    nested: { authorization: "Bearer abc" },
  });
  assert.equal((v as Record<string, unknown>).apiKey, "***REDACTED***");
  assert.equal(
    ((v as Record<string, unknown>).nested as Record<string, unknown>).authorization,
    "***REDACTED***",
  );
  assert.equal((v as Record<string, unknown>).id, "ok");
});

test("audit log: canonicalize is key-order independent", () => {
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }));
});

test("audit log: digest is stable across re-runs", () => {
  assert.equal(digest("a"), digest("a"));
  assert.notEqual(digest("a"), digest("b"));
});
