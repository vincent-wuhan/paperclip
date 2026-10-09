# OpsKeeper Incident Mirror

This Paperclip plugin implements the first Phase A slice: a read-only, company-scoped
OpsKeeper incident mirror. It polls through the host HTTP bridge, stores only mirror
state, exposes read-only agent tools, and renders a dashboard widget with stale-state
and OpsKeeper deep links.

OpsKeeper remains the authoritative source for incidents, approvals, remediation, and
audit. This plugin has no approval, repair, shell, or MCP mutation capability.

## Configuration

- `opskeeperBaseUrl`: HTTPS OpsKeeper API base URL.
- `opskeeperTokenRef`: secret reference to a scoped `ok-readonly` service-account token.
- `allowedHosts`: optional explicit host allowlist.
- `allowInsecureHttp`: development-only HTTP escape hatch; keep false in production.
- `requestTimeoutMs`: request timeout between 1,000 and 30,000 milliseconds.

## Verification

```bash
pnpm --filter @paperclipai/plugin-opskeeper-sync test
pnpm --filter @paperclipai/plugin-opskeeper-sync typecheck
pnpm --filter @paperclipai/plugin-opskeeper-sync build
```
