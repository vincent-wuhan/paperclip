# Phase 1 Codex Planning Flow 01

Status: Proposed
Date: 2026-04-25
Owners: Product + UI + Adapters + Shared
Depends on: `doc/plans/2026-04-25-phase-0-feasibility-and-operating-model-00.md`

## Goal

Stand up the intake -> plan portion of the loop so Paperclip can accept a human requirement, route it to a Codex planner, and persist a reusable implementation plan that downstream agents can execute against.

## Why This Phase Comes First

Paperclip already supports company-scoped issues, comments, assignments, agent runs, and `codex_local`.
That makes planning the cheapest slice to productize first.

This phase should avoid deep adapter work.
The purpose is to prove that Paperclip can:

- capture a request cleanly
- assign it to a Codex planner
- store a structured plan
- hand that plan to the execution phase without ambiguity

## Recommended Product Shape

### Intake object model

Use one top-level issue for the user request.

Recommended comment structure:

- `Requirement summary`
- `Acceptance criteria`
- `Constraints`
- `Target workspace / branch / repo context`
- `Open questions`

### Planning output model

Codex should generate a plan artifact that is mirrored in two places:

- structured issue comment for immediate control-plane visibility
- optional markdown plan artifact in the working repo when code work begins

### Planner role

The planner is a dedicated `codex_local` agent, not the same agent config used for review.

That lets you tune:

- planning instructions
- model choice
- allowed tools
- cost budget
- expected output format

## Likely Surfaces To Touch

- `packages/shared/src/types/issue.ts`
- `packages/shared/src/validators/issue.ts`
- `server/src/routes/issues.ts`
- `server/src/services/issues.ts`
- `server/src/services/heartbeat.ts`
- `ui/src/pages/IssueDetail.tsx`
- `ui/src/pages/NewAgent.tsx`
- `packages/adapters/codex-local/src/server/execute.ts`
- `packages/adapters/codex-local/src/ui/build-config.ts`

The exact implementation can stay light if existing issue comments are sufficient for plan storage.
If not, add a narrow plan-document convention instead of inventing a new communications system.

## Recommended Deliverables

- a reusable issue template for requirement intake
- a reusable agent template for Codex planning
- a canonical planning comment format
- a clear handoff marker from `planning` to `ready_for_execution`

## Risks

### Too much structure too early

If planning requires too many custom fields, the first-run experience will be slow.

### Too little structure

If the planner only emits free-form prose, downstream execution and review will be inconsistent.

## Exit Criteria

- a human can open a request and assign it to the Codex planner
- the planner emits a plan with stable sections
- the plan can be consumed by Claude execution without re-asking for basic context
- operator can tell from the issue view that planning is complete

## Tasks

| Task | Progress / Exit Signal |
| --- | --- |
| [ ] Define the intake template for new work requests. | Every new request captures goal, scope, constraints, and acceptance criteria in a repeatable format. |
| [ ] Create a dedicated `codex_local` planner agent profile. | Planner instructions, budget, model, and workspace rules are documented and reproducible. |
| [ ] Define the planning output contract. | Plan sections are fixed enough that Claude and Codex reviewer can consume them consistently. |
| [ ] Add a visible issue-phase marker for planning status. | Operator can distinguish `awaiting_plan`, `planning`, and `planned`. |
| [ ] Define how repo-side plan files map back to issue comments. | Each issue can link to exactly one canonical current plan artifact. |
| [ ] Pilot the intake -> plan flow on one real request. | One complete planning cycle is run and reviewed with no manual hidden steps. |

## Suggested Rollout

1. Start with issue comments and templates only.
2. Add richer UI affordances only after the format proves stable.
3. Keep planning and review as separate Codex agent personas from day one.

## Recommended Next Document

Proceed to `2026-04-25-phase-2-claude-execution-and-ralph-coordination-02.md` once the planning contract is stable.
