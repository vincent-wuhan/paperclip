# Phase 1A Config Foundation 00

Status: Proposed
Date: 2026-04-25
Owners: Operator + Ops
Depends on: `doc/plans/2026-04-25-phase-0-feasibility-and-operating-model-00.md`

## Goal

Use existing Paperclip capabilities to stand up the minimum configuration foundation for the local delivery loop, without changing core code.

This phase establishes:

- one company for the managed project
- the local runtime assumptions for Codex and Claude
- the issue hierarchy and naming conventions
- the workspace and execution defaults

## Scope

In scope:

- company setup
- local CLI readiness for `codex_local` and `claude_local`
- target repo/workspace selection
- issue taxonomy and status conventions
- operator runbook for waking and pausing agents

Out of scope:

- new adapter development
- new dashboard widgets
- custom automation
- Trae native integration
- Ralph native integration

## Working Assumptions

- planning and review use `codex_local`
- execution uses `claude_local`
- Ralph is represented as execution-phase coordination rules in prompts/comments
- Trae is represented as a test role placeholder until its automation surface is confirmed
- issues/comments remain the canonical handoff model

## Target Operating Model

For each requested change, create:

1. one parent issue for the request
2. one planning issue or planning section on the parent issue
3. one execution issue assigned to Claude
4. one review issue or review stage assigned to Codex reviewer
5. one testing issue or testing stage reserved for Trae or its interim substitute

If the team wants a lighter workflow, keep one parent issue plus structured comments.
Do not create more hierarchy until the first pilot proves necessary.

## Configuration Outcomes

By the end of this phase, the operator should be able to:

- create a request in a repeatable format
- pick the right company, project, and workspace
- assign planning to Codex
- route execution to Claude
- route review back to Codex
- reserve a test handoff slot for Trae

## Tasks

| Task | Progress / Exit Signal |
| --- | --- |
| [ ] Pick the pilot repository and map it to one Paperclip company. | One company is explicitly designated as the first local delivery loop environment. |
| [ ] Decide whether the pilot uses one parent issue or parent-plus-child issues. | The operator has one documented default hierarchy rule and does not improvise per request. |
| [ ] Verify local `codex` CLI availability and login on the host. | A manual Codex run succeeds outside Paperclip and can be referenced as baseline readiness. |
| [ ] Verify local `claude` CLI availability and login on the host. | A manual Claude run succeeds outside Paperclip and can be referenced as baseline readiness. |
| [ ] Decide the initial repo working directory and execution workspace policy. | One canonical repo path is documented for the pilot so agents are not pointed at inconsistent roots. |
| [ ] Decide whether the loop is event-driven or timer-driven. | Default recommendation is recorded; ideally assignment and on-demand wakeups first, timer later. |
| [ ] Define the issue title naming convention. | Requests, plans, execution, review, and testing issues all follow one predictable title format. |
| [ ] Define the issue status convention for layer 1. | The operator has a small stable set such as `todo`, `in_progress`, `in_review`, `blocked`, `done`. |
| [ ] Define comment section headers for all handoffs. | Planning, execution, review, and testing comments all use the same named sections. |
| [ ] Define who may manually wake, pause, or cancel each role. | Board/operator intervention rules are written down and visible. |
| [ ] Define the pilot budget envelope by role. | Planner, executor, reviewer, and tester each have an initial spend expectation or cap. |
| [ ] Create a short operator checklist for opening a new request. | A new request can be opened with the same 5-10 steps every time. |

## Recommended Defaults

- wake mode: `wakeOnAssignment = true`, `wakeOnOnDemand = true`, timer off or long interval
- issue communication: comments only, no side-channel requirement
- workspace policy: one canonical repo root for the pilot
- hierarchy: start simple, add child issues only if one-thread comments become noisy

## Deliverables

- one company chosen for the pilot
- one repo/workspace rule
- one issue convention sheet
- one operator kickoff checklist

## Exit Criteria

- the operator can create a new request without inventing the process from scratch
- the host is ready to run Codex and Claude locally
- a pilot issue can be opened with enough structure for the planning phase

## Recommended Next Document

Proceed to `2026-04-25-phase-1b-role-prompts-and-handoffs-01.md`.
