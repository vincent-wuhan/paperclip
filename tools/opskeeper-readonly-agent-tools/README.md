# Phase C — Read-Only Agent Tools for Paperclip × OpsKeeper

> OpenSpec §3.7 + §3.11. Implements the read-only Agent tool surface that
> backs the Paperclip Agent's incident/RCA/evidence/archive workflows.
> Nothing here can mutate OpsKeeper state. This bundle is the Build-time
> artifact handed off to the Plugin Runtime Integrator agent for merging
> into `paperclip-opskeeper-sync/`.

## Layout

```
agent-tools/
├── src/
│   ├── schema.ts          # JSON-schema validator (Draft 7 subset)
│   ├── timeout.ts         # Per-call timeout (hard-capped at 30s)
│   ├── rate-limit.ts      # Token-bucket limiter, per (tool, principal)
│   ├── audit-log.ts       # Hash-chained append-only audit log
│   ├── opskeeper.ts       # Read-only OpsKeeper fetch wrapper
│   ├── tool-host.ts       # Registry: schema → rate → timeout → audit
│   └── agent-tools.ts     # The four Phase C tools + builder
├── scripts/
│   └── lint-capabilities.mjs  # Static CI check for deny-prefix names
├── tests/                 # 22 unit + integration tests
├── docs/
│   └── security-review-3.11.md  # §3.11 security review conclusion
├── package.json
└── tsconfig.json
```

## Phase C tools

| Tool | Purpose | Defaults |
|---|---|---|
| `opskeeper_incident_lookup` | Keyword / time-bounded incident lookup | 8 rps, burst 16, 6s timeout |
| `opskeeper_rca_summary` | Fetch root-cause analysis block (read-only) | 12 rps, burst 24, 6s timeout |
| `opskeeper_evidence_list` | List evidence attachments on an incident | 10 rps, burst 20, 6s timeout |
| `opskeeper_archive_lookup` | Look up archived OpsKeeper incidents | 6 rps, burst 12, 6s timeout |

Every tool has a JSON schema (mandatory), a default timeout, a per-(tool,
principal) rate-limit, and an audit log entry. The registration path
refuses any tool whose name starts with a deny prefix
(`execute`, `shell`, `mutate`, `write-mcp`, `delete`, `drop`,
`destroy`, `approve`, `fix`, `repair`, `recover`, `reset`, `restart`,
`cross-resource`, `write_`).

## Run the tests

```bash
bun test tests/
```

22 tests across 5 files, all passing.

## Static capability lint

```bash
node scripts/lint-capabilities.mjs
```

Will fail (exit 1) if any tool literal in `src/*.ts` uses a deny prefix.

## Where the network goes

- `GET` / `HEAD` only.
- Per-tool `allowedHosts: ReadonlySet<string>` is required. Anything not in
  the set raises `NotAllowedError`.
- No follow-redirect.
- Loopback NOT in the default allow-list; deployments that need it must
  add it explicitly.

## Where the token goes

- A single scoped `ok-readonly` token, supplied per-tool at registration.
- Token is sent only as a `Bearer` header inside `opskeeperRead`.
- Token NEVER appears in the audit log (the `redact` function scrubs any
  field whose name matches `token|secret|password|authorization|api[-_]key`).
- Tool results do NOT echo the token.

## Read the security review

`docs/security-review-3.11.md` records the §3.11 conclusion, the threat
mapping, and the acceptance-criteria mapping.
