# Phase 1B Role Prompts And Handoffs 01

Status: Proposed
Date: 2026-04-25
Owners: Operator + Agent Designer
Depends on: `doc/plans/2026-04-25-phase-1a-config-foundation-00.md`

## Goal

Define the non-code operating contract for each role in the loop so agents can collaborate predictably using existing Paperclip agent configuration, issue comments, and execution policy surfaces.

## Why This Phase Matters

In layer 1, most workflow quality will come from role clarity rather than new product features.

If prompts and handoffs are weak:

- Codex planning will be vague
- Claude execution will drift
- review will duplicate planning
- testing will be hard to interpret

If prompts and handoffs are clear, the first pilot can run with minimal product changes.

## Roles To Configure

### Codex planner

Responsibility:

- transform requirement into an executable plan
- clarify scope and constraints
- identify unknowns and risks
- hand off a plan to execution without doing implementation

### Claude executor

Responsibility:

- execute the approved plan
- post progress and blockers
- follow Ralph-style coordination rules
- hand off to review with a clear completion summary

### Codex reviewer

Responsibility:

- inspect Claude output for bugs, regressions, missing tests, and mismatches against the plan
- return findings in a stable review format
- trigger replan only when needed

### Trae tester placeholder

Responsibility in layer 1:

- receive the testing brief
- execute the chosen validation path, whether Trae itself or an interim substitute
- post a structured pass/fail result back to the issue thread

## Existing Product Features To Reuse

- dedicated `codex_local` and `claude_local` adapter types
- assignee selection in issue creation
- reviewer/approval participants in issue execution policy
- issue comments as durable handoff records

Do not wait for new workflow features before configuring role discipline.

## Prompt And Handoff Contract

Every role should receive:

- issue link or identifier
- current objective
- constraints
- explicit definition of done for that phase
- expected output sections
- rules for when to stop and escalate

Every role should emit:

- summary
- status
- blockers or risks
- next recommended owner

## Tasks

| Task | Progress / Exit Signal |
| --- | --- |
| [ ] Write the Codex planner role brief. | Planner prompt clearly states that it decomposes work and does not jump into implementation. |
| [ ] Write the Claude executor role brief. | Executor prompt clearly states coding scope, progress updates, and stop conditions. |
| [ ] Encode Ralph rules into the executor brief. | The Claude role always announces scope, blockers, completion summary, and residual risk. |
| [ ] Write the Codex reviewer role brief. | Reviewer prompt clearly prioritizes bugs, regressions, missing tests, and plan mismatches. |
| [ ] Write the tester role brief for Trae or its interim substitute. | Testing always produces a concise environment, steps, and pass/fail record. |
| [ ] Define one standard planning comment template. | Each plan comment includes objective, assumptions, tasks, risks, and exit conditions. |
| [ ] Define one standard execution update template. | Each execution update includes current step, files touched or scope, blockers, and next action. |
| [ ] Define one standard review template. | Each review result distinguishes findings, open questions, and approval status. |
| [ ] Define one standard test result template. | Each test result includes setup, command or path, result, and failure summary. |
| [ ] Decide which role transitions use issue reassignment versus comments only. | The operator has a simple rule for when the assignee changes and when a reviewer is added instead. |
| [ ] Configure the planner, executor, and reviewer as separate agent personas. | In Paperclip, these roles are visibly distinct and not one generic reusable agent. |
| [ ] Run prompt dry-runs outside the full pilot on one toy issue. | The team confirms the prompts produce the right shape of output before real work begins. |

## Recommended Minimal Output Shapes

### Planner output

- request summary
- assumptions
- step-by-step tasks
- risks
- handoff to execution

### Executor output

- current implementation status
- scope actually worked on
- blockers
- completion note
- handoff to review

### Reviewer output

- findings
- missing validation
- approval or replan recommendation

### Tester output

- environment
- checks run
- result
- failure details
- handoff to replan or done

## Exit Criteria

- all four roles have written briefs
- all four handoff templates are stable enough to reuse
- prompts have been dry-run once before the first live pilot

## Recommended Next Document

Proceed to `2026-04-25-phase-1c-pilot-operations-and-measurement-02.md`.
