# Phase 2 Claude Execution And Ralph Coordination 02

Status: Proposed
Date: 2026-04-25
Owners: Adapters + Server + UI
Depends on: `doc/plans/2026-04-25-phase-1-codex-planning-flow-01.md`

## Goal

Make the execution phase dependable: Claude Code picks up a Codex-authored plan, executes against the target workspace, and uses Ralph-managed collaboration rules so implementation work stays coordinated rather than chaotic.

## Phase Position

This phase should focus on dependable execution before adding fancy automation.
The key question is not whether Claude can write code.
The key question is whether Paperclip can make execution observable, resumable, and safe.

## Recommended Execution Model

### Claude execution agent

Use a dedicated `claude_local` agent for implementation.

It should receive:

- the current issue
- the current approved plan
- workspace and branch expectations
- rules for when to comment, when to block, and when to hand back for review

### Ralph coordination

Ralph should start as an execution operating method, not a mandatory platform dependency.

Recommended v1 representation:

- Ralph conventions embedded in Claude execution instructions
- Ralph-style coordination checkpoints posted back as issue comments
- optional collaboration checklist generated at execution start

Examples of Ralph-managed coordination behaviors:

- summarize current subtask before editing
- announce intended file ownership or write scope
- post blockers before context switching
- emit a completion note with changed files and residual risks

If Ralph later proves to have a stable automation interface, promote it to its own adapter or companion service.

## Likely Surfaces To Touch

- `packages/adapters/claude-local/src/server/execute.ts`
- `packages/adapters/claude-local/src/server/parse.ts`
- `packages/adapters/claude-local/src/ui/build-config.ts`
- `server/src/services/heartbeat.ts`
- `server/src/services/execution-workspaces.ts`
- `server/src/routes/issues.ts`
- `ui/src/pages/AgentDetail.tsx`
- `ui/src/pages/IssueDetail.tsx`

## Operational Requirements

- one obvious source of truth for the plan being executed
- one obvious source of truth for current execution status
- resumable work when Claude is reawakened on the same issue
- clear blocking path back to board operator or Codex planner

## Risks

### Collaboration drift

If Ralph is only implied and not expressed in templates or comments, collaboration quality will vary by run.

### Resume ambiguity

If Claude wakes without a crisp summary of prior progress, it may repeat work or edit the wrong files.

### Workspace safety

Execution should respect worktree or workspace rules so multiple runs do not collide.

## Exit Criteria

- Claude execution can start from a Codex plan with no hidden operator steps
- execution comments make progress legible to the board operator
- blocked execution can escalate cleanly
- Ralph coordination rules are visible enough to be auditable

## Tasks

| Task | Progress / Exit Signal |
| --- | --- |
| [ ] Create a dedicated `claude_local` executor profile. | Execution role is separate from planner and reviewer roles, with its own prompt and budget rules. |
| [ ] Define the execution handoff package from Codex plan to Claude. | Claude always receives plan link, scope, acceptance criteria, and workspace context. |
| [ ] Encode Ralph collaboration rules into executor instructions. | Each run emits coordination notes, file ownership intent, blockers, and completion summaries. |
| [ ] Make execution progress visible on the issue thread. | Operator can track `started`, `in progress`, `blocked`, `ready for review`, and `needs replan`. |
| [ ] Define resume semantics for long-running implementation issues. | Reawakened Claude runs can continue from prior context without manual restitching. |
| [ ] Pilot the execution flow on a narrow repo change. | One real change is implemented through Paperclip with issue comments as the audit trail. |

## Suggested Rollout

1. Start with one executor agent and one repo.
2. Keep Ralph as instruction-level governance first.
3. Only add deeper runtime coupling if the collaboration outputs are clearly useful.

## Recommended Next Document

Proceed to `2026-04-25-phase-3-codex-review-and-trae-test-loop-03.md` after execution notes and handoffs are stable.
