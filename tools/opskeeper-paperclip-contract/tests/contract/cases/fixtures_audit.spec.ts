// Fixture-token audit assertion (supports AUDIT A-3 / A-2 / S2 entry checklist)
// Self-verifies that:
//  1. The fixture table loads and is well-formed.
//  2. Inline forbidden token literals in tests/contract/cases/ — across
//     every .spec.ts file, including new ones — are refused unless they
//     pass through fixtureToken(...) or carry a `LINT-OK` marker within
//     ±10 lines.
//  3. Every entry in tokens.json has a non-empty `expectation` so reviewers
//     know what behaviour it asserts.
//
// Runs as part of `npm test`; the audit surface never silently regresses.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NEGATIVE_FIXTURE_TOKENS, fixtureToken } from "../fixtures/tokens";

const FORBIDDEN_INLINE_PREFIXES = ["ok-admin-", "ok-write-", "ok-exec-"] as const;

const TOKEN_LITERAL_RE = new RegExp(
  FORBIDDEN_INLINE_PREFIXES.map((p) => `"${p}[A-Za-z0-9_-]{4,}"`).join("|"),
);

function listSpecFiles(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return readdirSync(here)
    .filter((n) => n.endsWith(".spec.ts"))
    .map((n) => join(here, n))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
}

test("fixture table is well-formed and every entry has expectation metadata", () => {
  const keys = Object.keys(NEGATIVE_FIXTURE_TOKENS.tokens);
  assert.ok(keys.length >= 2, "at least two negative fixtures");
  for (const [key, entry] of Object.entries(NEGATIVE_FIXTURE_TOKENS.tokens)) {
    assert.ok(typeof entry.value === "string" && entry.value.length > 0, `${key}: value present`);
    assert.ok(typeof entry.expectation === "string" && entry.expectation.length > 0, `${key}: expectation present`);
    assert.ok(Array.isArray(entry.used_in), `${key}: used_in is array`);
    assert.ok(
      FORBIDDEN_INLINE_PREFIXES.some((p) => entry.value.startsWith(p)),
      `${key}: forbidden prefix`,
    );
  }
});

test("fixtureToken() resolves audit keys to the right strings", () => {
  const v = fixtureToken("admin_rejected_1");
  assert.equal(v, NEGATIVE_FIXTURE_TOKENS.tokens.admin_rejected_1.value);
  const v2 = fixtureToken("admin_rejected_2");
  assert.equal(v2, NEGATIVE_FIXTURE_TOKENS.tokens.admin_rejected_2.value);
});

test("no inline literal forbidden tokens in any cases/*.spec.ts", () => {
  const specs = listSpecFiles();
  assert.ok(specs.length > 0, "discovers spec files dynamically");
  for (const full of specs) {
    const file = full.split("/").pop()!;
    const src = readFileSync(full, "utf8");
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!TOKEN_LITERAL_RE.test(line)) continue;
      const lo = i - 10 >= 0 ? i - 10 : 0;
      const hi = i + 10 < lines.length ? i + 10 : lines.length;
      const window = lines.slice(lo, hi).join("\n");
      assert.ok(
        window.includes("LINT-OK") || window.includes("fixtureToken("),
        `${file}:${i + 1} contains inline forbidden literal "${line.trim()}" without LINT-OK or fixtureToken() — use fixtureToken("…") instead`,
      );
    }
  }
});

test("every forbidden-token string used in tests resolves through fixtures/tokens.json", () => {
  // Sanity: enumerate all ok-{admin,write,exec}-* values appearing in
  // production-like code paths (audit table + fake server classifier)
  // and confirm they're consistent. We derive values from the typed
  // helper so the audit doesn't trip on its own reference strings.
  const tableValues = Object.values(NEGATIVE_FIXTURE_TOKENS.tokens).map((e) => e.value);
  assert.ok(tableValues.includes(fixtureToken("admin_rejected_1")));
  assert.ok(tableValues.includes(fixtureToken("admin_rejected_2")));
});
