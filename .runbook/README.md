# .runbook/

Operator runbook for the `paperclip` repo. Each entry below pairs a filename with
a one-line purpose so a human can find the right script without opening every file.

LaunchAgents (`*.plist`) are loaded by `launchd` and call into the Python or bash
scripts in this directory; shell scripts (`.sh`) are executable Bash helpers, and
the Python files (`.py`) form the fund-observatory pipeline.

## Index

- `__pycache__` - Auto-generated Python bytecode cache directory for the runbook scripts (safe to delete).
- `build-fund-mcp-ledger.py` - Reads the fund-observatory handoffs for a month and writes `mcp-ledger.json` with daily MCP usage.
- `com.paperclip.fundobservatory.autoglm-watch.plist` - launchd agent that runs `watch-autoglm-recovery.sh` every 900 seconds.
- `com.paperclip.fundobservatory.plist` - launchd agent that keeps the Paperclip server (`start.sh`) alive on port 3110.
- `com.paperclip.fundobservatory.post-run-watchdog.plist` - launchd agent that runs `post-run-watchdog.py` after each fund cycle.
- `configure-autoglm-secret.sh` - Pushes `AUTOGLM_ACCESS_TOKEN` into the Paperclip company for every agent that needs it.
- `dispatch-fund-observatory.py` - Opens the four daily fund-observatory issues (data, research, risk, report) for a date.
- `fund-observatory-health.sh` - Orchestrates the daily fund-observatory pipeline (dispatch, research, verify, compose).
- `install-launchagent.sh` - Installs the three `com.paperclip.fundobservatory*` LaunchAgents and waits for :3110.
- `post-run-watchdog.py` - Verifies the report artifact matches the verified report after a cycle and reconciles the pipeline status.
- `record-fund-report-artifact.py` - Uploads a verified fund-report Markdown as a comment attachment on the reporter issue.
- `rerun-degraded-research.py` - Reopens the deep-research task for a date when the research handoff is missing or degraded.
- `start.sh` - Starts the local Paperclip dev server with `pnpm dev` on port 3110 if the port is free.
- `verify-fund-report.py` - Validates a daily fund-report Markdown against frontmatter, quotes, and the MCP-audit totals.
- `watch-autoglm-recovery.sh` - File-locked recovery loop that reruns degraded deep research when AUTOGLM access has expired.
- `write-fund-handoff.py` - Atomically writes a per-role handoff JSON into the pipeline directory for a given date.
