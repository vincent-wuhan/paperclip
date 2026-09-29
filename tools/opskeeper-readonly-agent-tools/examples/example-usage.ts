/**
 * Phase C wiring example.
 *
 * This file shows how a Paperclip plugin host would build the Phase C
 * registry and emit a few sample invocations. It is intentionally small
 * and DOES NOT mutate OpsKeeper state — each tool name below either
 * exists in the registry or is rejected at registration.
 */

import { buildPhaseCRegistry } from "../src/agent-tools.ts";

async function main() {
  const allowedHosts = new Set<string>(["opskeeper.local"]);
  const reg = buildPhaseCRegistry({
    opskeeperBaseUrl: "https://opskeeper.local",
    allowedHosts,
    token: process.env.OPSKEEPER_TOKEN,
  });

  console.log("Registered tools:", reg.list());

  // Try to register a mutation tool — must be rejected.
  try {
    reg.register({
      name: "execute-fix-script",
      description: "should not register",
      inputSchema: { type: "object" },
      executor: async () => ({}),
    });
  } catch (e) {
    console.log("DENY_PREFIXES enforced:", (e as Error).message);
  }

  // Schema-rejected call.
  const bad = await reg.call({
    toolName: "opskeeper_rca_summary",
    principalId: "u1",
    args: { incidentId: "id with spaces" },
  });
  console.log("Schema-rejected call:", bad.outcome, bad.errorMessage);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
