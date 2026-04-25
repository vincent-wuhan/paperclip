# Phase 3 Codex Review And Trae Test Loop 03

Status: Proposed
Date: 2026-04-25
Owners: Adapters + Server + UI + Shared
Depends on: `doc/plans/2026-04-25-phase-2-claude-execution-and-ralph-coordination-02.md`

## Goal

Close the quality loop: Codex reviews Claude's implementation, Trae performs testing, and the resulting defects or failures are turned back into structured replanning inputs instead of ad hoc chat.

## Recommended Review Model

### Codex reviewer

Use a second `codex_local` persona for review and replanning.
Do not reuse the planner prompt unchanged.

The reviewer should focus on:

- correctness risks
- regressions
- missing tests
- unclear implementation notes
- follow-up task extraction

### Trae tester

Treat Trae as a testing specialist role, but keep the integration boundary pragmatic.

Preferred order:

1. if Trae exposes a stable CLI/API, model it as a local or external adapter
2. otherwise, use an interim testing agent pattern with existing runtime support
3. preserve the same issue-phase contract so the control plane does not care which runtime actually performs testing

## Recommended State Machine

Suggested issue phases:

- `ready_for_review`
- `reviewing`
- `ready_for_test`
- `testing`
- `test_failed`
- `replan_required`
- `done`

The important point is that review comments and test outputs should both attach to the issue tree, not disappear into tool-local logs.

## Likely Surfaces To Touch

- `packages/adapters/codex-local/src/server/execute.ts`
- `packages/shared/src/types/issue.ts`
- `packages/shared/src/validators/issue.ts`
- `server/src/services/issues.ts`
- `server/src/routes/issues.ts`
- `server/src/services/heartbeat.ts`
- `ui/src/pages/IssueDetail.tsx`
- `ui/src/pages/AgentDetail.tsx`
- adapter/plugin surfaces for future `trae_local` support

## Risks

### Review duplication

If the reviewer and tester surface the same problems in inconsistent formats, replanning will be noisy.

### Trae dependency risk

If Trae cannot be automated reliably, the whole loop should not block on it for the first pilot.

### State explosion

Too many statuses will make the board harder to read.
Prefer a narrow state machine with comments carrying the detail.

## Exit Criteria

- Codex can review completed Claude work and post structured findings
- the testing phase produces auditable pass/fail outputs
- failed tests create crisp follow-up work rather than generic "try again" loops
- the board operator can tell why an issue returned to planning

## Tasks

| Task | Progress / Exit Signal |
| --- | --- |
| [ ] Create a dedicated `codex_local` reviewer and replanner profile. | Review instructions emphasize bugs, regressions, and missing tests instead of initial decomposition. |
| [ ] Define the review output contract. | Findings are posted in a stable structure that downstream replanning can parse. |
| [ ] Decide how Trae will be integrated for the first pilot. | Testing role is marked as `native adapter`, `external adapter`, or `interim substitute`. |
| [ ] Define the test output contract. | Test phase always emits environment, command, result, and failure summary in a repeatable format. |
| [ ] Add a narrow review/test state machine to the issue workflow. | Operator can see when work is waiting on review, testing, or replanning. |
| [ ] Pilot the execute -> review -> test -> replan loop on one real issue. | One issue completes or cycles back with a documented reason instead of manual interpretation. |

## Suggested Rollout

1. Start with Codex review before Trae automation.
2. Add Trae only after the review contract is stable.
3. Keep testing artifacts attached to the same issue lineage.

## Recommended Next Document

Proceed to `2026-04-25-phase-4-closed-loop-automation-and-rollout-04.md` when manual operator supervision can already run one full loop.
