# Phase 4 Closed Loop Automation And Rollout 04

Status: Proposed
Date: 2026-04-25
Owners: Server + UI + Adapters + Ops
Depends on: `doc/plans/2026-04-25-phase-3-codex-review-and-trae-test-loop-03.md`

## Goal

Turn the pilot workflow into a repeatable operating system: automate the safe parts of handoff, add visibility and guardrails, and roll the loop out to real local project work without losing operator control.

## What This Phase Should Achieve

- lower manual coordination overhead
- improve observability of loop state
- make replanning from failures routine
- keep budgets and governance intact

This phase should not aim for "fully autonomous no-touch software factory."
It should aim for a reliable local control-plane loop with human override everywhere.

## Recommended Automation Scope

Safe automations:

- wake next role when prior phase reaches an allowed terminal marker
- create follow-up issue/comment templates from review or test failure outputs
- summarize latest plan, execution, review, and test state on the parent issue
- enforce budget and pause rules before waking expensive agents

Automations to defer:

- automatic merge or release actions
- automatic retries without a recorded cause
- autonomous branch cleanup that could hide failed work

## Recommended Visibility Layer

The board should be able to answer at a glance:

- which issue is waiting on planning, execution, review, or test
- which agent owns the next action
- whether the loop is blocked by tooling, repo state, or unclear requirements
- how much the workflow costs per issue and per phase

## Likely Surfaces To Touch

- `server/src/services/heartbeat.ts`
- `server/src/services/activity-log.ts`
- `server/src/routes/activity.ts`
- `server/src/routes/issues.ts`
- `ui/src/pages/Dashboard.tsx`
- `ui/src/pages/IssueDetail.tsx`
- `ui/src/pages/AgentDetail.tsx`
- any future automation or routine scheduler surfaces

## Rollout Recommendation

Roll out in three pilot steps:

1. one repo, one company, one planner, one executor, one reviewer, one tester
2. one additional repo or workstream after the first loop is stable
3. shared templates and defaults only after two successful pilots

## Risks

### Premature automation

If the team automates handoffs before the comment and state contracts are stable, errors will compound faster.

### Cost opacity

More roles can mean more spend.
Cost visibility must remain phase-aware.

### Operator overload

A loop that is technically automated but hard to interpret is worse than a partly manual loop with strong visibility.

## Exit Criteria

- one full request can move through plan -> execute -> review -> test -> replan with minimal manual routing
- board operator can intervene at every stage
- costs and blockers are visible enough to manage day-to-day
- templates are stable enough to reuse on future projects

## Tasks

| Task | Progress / Exit Signal |
| --- | --- |
| [ ] Add lightweight handoff automation between approved phase markers. | Planner, executor, reviewer, and tester can be woken in sequence without hidden manual glue. |
| [ ] Create parent-issue summaries for the whole loop. | Operator can read one summary and understand the current phase, owner, and blockers. |
| [ ] Make budgets and pause rules phase-aware. | Expensive roles are paused or escalated before unbounded loops happen. |
| [ ] Add dashboard views for `planning`, `executing`, `reviewing`, `testing`, and `replan_required`. | The board can scan loop health without opening every issue. |
| [ ] Run a two-issue pilot and compare outcomes against manual coordination. | The automated loop shows equal or better throughput and fewer dropped handoffs. |
| [ ] Freeze a reusable template pack for future companies. | New local projects can adopt the loop with minimal custom setup. |

## Success Metrics

- time from intake to first plan
- time from plan approval to execution start
- review turnaround time
- test-fail to replan turnaround time
- loop completion rate
- average cost per completed issue

## Follow-On Work

After this phase, reassess whether Trae and Ralph deserve first-class adapter investments or whether instruction-level integration is sufficient.
