# Phase 1C Pilot Operations And Measurement 02

Status: Proposed
Date: 2026-04-25
Owners: Operator + Reviewer
Depends on: `doc/plans/2026-04-25-phase-1b-role-prompts-and-handoffs-01.md`

## Goal

Run the first configuration-only pilot of the local delivery loop and capture enough evidence to decide whether the workflow should move on to productized automation.

## Pilot Principle

This phase is still layer 1.
The goal is not to prove that the whole system is elegant.
The goal is to prove that the workflow is usable with current Paperclip surfaces.

## Pilot Scope

Choose one change request that is:

- real enough to matter
- small enough to finish in one or two loop iterations
- testable without inventing new infrastructure

Avoid for the first pilot:

- broad refactors
- multi-repo changes
- changes that require a Trae adapter before testing can even begin

## Pilot Artifacts To Capture

- original requirement
- Codex plan
- Claude execution progress notes
- Codex review findings
- testing result
- final replan or completion note
- operator observations on friction points

## Measurement Focus

Measure only what helps decide whether layer 2 is worth building:

- Was the handoff clear?
- Did roles overlap or conflict?
- Could the operator tell who owned the next step?
- Did comments stay understandable?
- Did the loop close without hidden manual glue?

## Tasks

| Task | Progress / Exit Signal |
| --- | --- |
| [ ] Choose one pilot issue with limited scope. | The selected issue is small, real, and can be validated without custom product work. |
| [ ] Open the parent issue using the new intake checklist. | The requirement arrives in the agreed structured format rather than free-form chat. |
| [ ] Assign the planning phase to the Codex planner. | A plan is produced using the standard planning template. |
| [ ] Review the plan manually before execution. | The operator confirms the plan is actionable and scoped tightly enough for the pilot. |
| [ ] Assign or hand off execution to the Claude executor. | Claude begins from the approved plan rather than re-deriving the task. |
| [ ] Require at least one mid-run progress comment from Claude. | The operator can see execution progress without opening raw logs first. |
| [ ] Hand off to the Codex reviewer using the standard review template. | Review findings are durable, structured, and tied to the same issue lineage. |
| [ ] Run the testing phase with Trae or the interim tester role. | Test output is posted back in the standard test result shape. |
| [ ] If testing fails, run one structured replan cycle. | Codex replanning uses concrete failures, not generic "try again" feedback. |
| [ ] Close the loop with a final operator retrospective comment. | The issue contains one summary of what worked, what was confusing, and what was manual. |
| [ ] Record where the workflow depended on human glue. | A list of code candidates for layer 2 is extracted from real pilot pain points. |
| [ ] Decide go/no-go for productization. | The team explicitly chooses `repeat as-is`, `tighten configuration`, or `start code changes`. |

## Pilot Review Questions

- Did the issue hierarchy feel right?
- Were the role prompts distinct enough?
- Did Ralph-style execution notes actually help?
- Was review separate from testing in a useful way?
- Was Trae integration missing, blocked, or optional?
- Which steps should stay manual even in layer 2?

## Success Criteria

- one request completes or returns to replan through the full loop
- the operator can reconstruct the whole story from the issue thread
- at least three workflow pain points are identified with evidence
- the team can clearly state what code work would be worth doing next

## Non-Success Criteria

Do not declare success merely because:

- the agents all ran once
- a code change happened
- the operator manually patched around every handoff

The pilot is only successful if the workflow is legible and repeatable.

## Exit Criteria

- one full pilot has been run
- one retrospective has been written
- one shortlist of layer-2 product changes has been extracted

## Follow-On

If this phase is successful, revisit:

- `doc/plans/2026-04-25-phase-2-claude-execution-and-ralph-coordination-02.md`
- `doc/plans/2026-04-25-phase-3-codex-review-and-trae-test-loop-03.md`
- `doc/plans/2026-04-25-phase-4-closed-loop-automation-and-rollout-04.md`

with evidence from the pilot rather than assumptions.
