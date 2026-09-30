// Typed entry point to the negative-fixture token table.
//
// The audit-table lives in `tokens.json` (the source of truth reviewers
// audit when chasing LINT-OK markers). This file re-exports the typed
// values so test cases can import them via TS without needing JSON
// import assertions. New fixture tokens must be added to `tokens.json`
// AND mirrored here.

import tokens from "./tokens.json" with { type: "json" };

export interface FixtureToken {
  value: string;
  expectation: string;
  used_in: string[];
}

export interface TokenTable {
  purpose: string;
  lint_marker: string;
  scopes_allowed_inline: string[];
  tokens: Record<string, FixtureToken>;
}

export const NEGATIVE_FIXTURE_TOKENS = tokens as TokenTable;

/** Convenience: get a forbidden-token value by its audit key. */
export function fixtureToken(key: keyof TokenTable["tokens"]): string {
  const entry = NEGATIVE_FIXTURE_TOKENS.tokens[key as string];
  if (!entry) throw new Error(`Unknown fixture token key: ${String(key)}`);
  return entry.value;
}

/** Audit table — printed when reviewers run lint with --verbose. */
export function auditFixtureTable(): string {
  const lines: string[] = [];
  lines.push("negative-fixture audit table");
  lines.push("-------------------------------------");
  for (const [key, entry] of Object.entries(NEGATIVE_FIXTURE_TOKENS.tokens)) {
    lines.push(`  ${key.padEnd(28)}  ${entry.value.padEnd(28)}  ${entry.expectation}`);
  }
  return lines.join("\n");
}
