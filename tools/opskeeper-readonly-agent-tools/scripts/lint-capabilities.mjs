#!/usr/bin/env node
/**
 * lint:capabilities — static check (Phase C).
 *
 * The script scans every registered tool name in src/*.ts and src/agent-tools.ts.
 * It fails (exit 1) if any tool name matches one of the deny-list prefixes
 * defined in src/tool-host.ts:
 *
 *   execute, shell, mutate, write-mcp, write_, delete, drop, destroy,
 *   approve, fix, repair, recover, reset, restart, cross-resource
 *
 * OpenSpec §F: "永久黑名单". See openspec/changes/opskeeper-paperclip-feasibility
 * /threat-model.md §F. This script is the OpenSpec §5.1 enforcement hook.
 *
 * Usage:
 *   node scripts/lint-capabilities.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DENY_PREFIXES = [
  "execute",
  "shell",
  "mutate",
  "write-mcp",
  "write_",
  "delete",
  "drop",
  "destroy",
  "approve",
  "fix",
  "repair",
  "recover",
  "reset",
  "restart",
  "cross-resource",
];

const TOOL_NAME_RE = /name:\s*"([^"]+)"/g;
const TOOL_KIND_RE = /^\s*(function|const)\s+(inc|rca|evid|archive|evidence|rcasummary|incidentLookup|rcaSummary|evidenceList|archiveLookup|inspect|triage|list|get|approval|fix|repair|recover|cross|exec|execute|shell|mutate|write|delete|drop|destroy|approve|reset|restart)\w*Tool\s*\(/gim;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) files.push(p);
  }
  return files;
}

function listToolNames(srcFile, body) {
  const matches = [];
  for (const m of body.matchAll(TOOL_NAME_RE)) {
    matches.push({ file: srcFile, name: m[1] });
  }
  return matches;
}

const offenders = [];
for (const f of walk(path.join(ROOT, "src"))) {
  const body = readFileSync(f, "utf8");
  for (const { file, name } of listToolNames(f, body)) {
    const lower = name.toLowerCase();
    for (const deny of DENY_PREFIXES) {
      if (lower.startsWith(deny)) {
        offenders.push({ file, name, deny });
      }
    }
  }
}

if (offenders.length === 0) {
  console.log("lint:capabilities PASS — no deny-prefix tool names registered.");
  process.exit(0);
}

console.error("lint:capabilities FAIL — deny-prefix tool names found:");
for (const o of offenders) {
  console.error(`  ${o.file}: tool "${o.name}" matches deny prefix "${o.deny}"`);
}
process.exit(1);
