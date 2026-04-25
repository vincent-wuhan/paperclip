# Phase 0 Feasibility And Operating Model 00

Status: Proposed
Date: 2026-04-25
Owners: Product + Server + UI + Adapters

## Goal

Decide whether Paperclip can manage the local delivery loop:

- requirement intake
- Codex creates the plan
- Claude Code executes
- Codex reviews
- Trae tests
- Codex replans from test feedback

with Ralph coordinating execution-time collaboration during the Claude Code phase.

## Feasibility Summary

This workflow is feasible in Paperclip, but not all parts are equally mature today.

Directly feasible now:

- use Paperclip as the control plane for the whole loop
- run separate `codex_local` and `claude_local` agents with different roles
- model planning, execution, review, testing, and replan as issue states plus comments
- use budgets, approvals, activity logs, and issue hierarchy to keep the loop governed

Feasible with light product configuration or workflow conventions:

- run two Codex roles: planner and reviewer
- capture execution artifacts and review/test comments back onto the same issue tree
- enforce a handoff order through statuses, labels, templates, and agent instructions

Not first-class today and likely needs adapter or plugin work:

- Trae as a named runtime target
- Ralph as a native Paperclip collaboration primitive
- automatic loop transitions that are fully policy-driven without some orchestration glue

## Current Repo Facts

The current repo already provides the strongest foundation for this model:

- local CLI adapters exist for `codex_local` and `claude_local`
- company-scoped agents, issues, comments, approvals, budgets, and heartbeat runs are core V1 surfaces
- external adapters can be managed through the Adapter Manager and plugin loader

The main gaps for this exact workflow are:

- no built-in `trae_local` adapter in `packages/adapters/`
- no built-in `ralph_*` adapter or collaboration subsystem
- no opinionated multi-agent handoff template for planner -> executor -> reviewer -> tester loops

## Recommended Product Stance

Paperclip should treat this workflow as a structured control-plane pattern, not as a special hardcoded product mode.

Recommended modeling:

- one company per managed codebase or delivery lane
- one top-level issue per requested change
- child issues or sub-phases for `plan`, `execute`, `review`, `test`, and `replan`
- comments as the canonical handoff channel
- artifacts linked from comments rather than inventing a parallel chat surface

## Recommended Integration Strategy

### Codex

Use built-in `codex_local` immediately for:

- planner agent
- reviewer/replanner agent

### Claude Code

Use built-in `claude_local` immediately for:

- execution agent
- optional execution lead if you want a second Claude role later

### Ralph

Treat Ralph as execution-phase coordination logic first, not a required first-class Paperclip runtime.

Recommended initial representation:

- Ralph rules live inside Claude execution instructions
- Ralph outputs are posted back as execution notes, dependency requests, or collaboration checklists

Only add a dedicated adapter if Ralph exposes a stable CLI/API and the workflow proves valuable enough to justify native integration.

### Trae

Treat Trae as the biggest technical unknown in this stack.

Recommended order:

1. confirm whether Trae has a stable local CLI or callable automation surface
2. if yes, add an external adapter or lightweight local adapter
3. if no, emulate the testing phase first with an existing local adapter plus repo test commands, then swap in Trae later

## Risks

### Product risk

If this is implemented as a chat-first flow, it will drift away from the V1 control-plane model.

### Adapter risk

Trae and Ralph may not have stable host automation surfaces, which would force brittle wrappers.

### Operational risk

A loop with planner, executor, reviewer, tester, and replanner can create noisy wakeups and duplicate work unless handoff rules are explicit.

### UX risk

If status transitions are not obvious, operators may lose track of whether the loop is blocked on execution, review, or testing.

## Exit Criteria

- a clear yes/no on using current built-ins for Codex and Claude
- a clear decision on whether Trae is phase-1 mandatory or phase-2 optional
- a clear decision on whether Ralph starts as prompt/policy or as a dedicated adapter
- agreement on the canonical issue and comment handoff model

## Tasks

| Task | Progress / Exit Signal |
| --- | --- |
| [ ] Confirm `codex_local` is the planner and reviewer runtime of record. | Both roles are explicitly mapped to separate agent configs. |
| [ ] Confirm `claude_local` is the execution runtime of record. | Execution agent config and workspace expectations are documented. |
| [ ] Validate whether Trae has a stable CLI or API usable by Paperclip. | Decision recorded as `native adapter`, `external adapter`, or `defer`. |
| [ ] Validate whether Ralph is better modeled as policy or adapter in v1. | Decision recorded as `instruction layer first` or `adapter first`. |
| [ ] Lock the control-plane model for issue states and handoffs. | One agreed issue lifecycle exists for intake -> plan -> execute -> review -> test -> replan. |
| [ ] Define success metrics for the pilot. | Latency, loop completion rate, review churn, and test-fail recovery metrics are written down. |

## Recommended Next Document

Proceed to `2026-04-25-phase-1-codex-planning-flow-01.md` after the feasibility decisions above are locked.
