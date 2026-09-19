---
name: step-by-step
description: Guide a complex task one approved step per turn with a short situation summary, a titles-only plan, explicit go/why/skip/back/stop controls, and resumable local state. Use when the user invokes /step-by-step or $step-by-step, asks to proceed one step at a time, or wants to approve each stage of a multi-part task.
---

# Step by step

Keep the user in control of a complex task by presenting and executing only one
bounded step at a time.

## Preserve higher-priority contracts

- Follow system and developer instructions, the nearest `AGENTS.md`, and any
  mandatory project skill before this workflow.
- Where a project mandates its own orchestration or a routing declaration before
  a response, satisfy that first; it may appear ahead of the response format
  below.
- Treat this skill as a pacing and approval layer. It does not expand authority,
  relax safety checks, change project scope, or replace required verification.
- Keep any model pinned by the project contract. Otherwise, suggest a model only
  when a clearly available alternative materially changes cost or capability.

## Start or resume

1. Use the supplied argument as the subject. If it is absent, use the most recent
   clearly active problem. If neither exists, ask for the subject in one sentence.
2. Read `.agent/state/step_by_step.md` when it exists. Resume it only when its
   subject matches and its status is `ACTIVE` or `PAUSED`; otherwise start a new
   run.
3. Perform only the read-only investigation needed to make the first plan
   accurate. Do not make implementation or external-state changes yet.
4. Create or refresh the state file without storing credentials, private data, or
   large logs. The `.agent/` directory is local state and must remain outside Git.

## First response

Use this order and then stop:

1. `Situation` — exactly three short plain-language sentences stating the current
   condition, why it matters, and the important boundary. Do not include paths or
   code.
2. `Plan` — a numbered list of titles only, with no more than seven steps.
3. `Model` — write `stay` when the current or project-pinned model is appropriate;
   otherwise name one available model and give one short reason.
4. `Step 1 — <title>` — describe one bounded action, its expected outcome, any
   files or external systems it will change, and its verification. Keep the step
   under 150 words.
5. End with: `Reply: go · why · skip · back · stop`.

Do not execute Step 1 in the same turn that introduces the plan.

## Control replies

- `go` — execute only the offered step, verify it, update the state file, present
  the next single step, and stop. A `go` authorizes only the effects explicitly
  disclosed in that step.
- `why` — give the evidence and reasoning for the current step without executing
  it, then present the same controls and stop.
- `skip` — record the step as skipped, state the resulting risk briefly, present
  the next step, and stop.
- `back` — move to the preceding reversible step. Explain any irreversible or
  external effect and require a new explicit `go` before undoing it.
- `stop` — mark the run `PAUSED`, state the next resumable point, and stop work.

Treat any other user message as a correction or scope change. Update the plan and
present one revised next step without silently executing it.

## Step execution rules

- Keep each post-start response under 150 words, apart from a declaration the
  project mandates or exact command output the user requested.
- Group only actions that are necessary for one verifiable outcome. Do not hide
  unrelated edits inside a step.
- Name deployments, pushes, messages, production writes, destructive operations,
  and other external effects in the proposed step. Require `go` after disclosing
  them.
- If verification fails, do not advance. Record the evidence and offer a revised
  version of the same step.
- If progress requires a material user decision, mark the step `BLOCKED` and ask
  one concise question.
- On completion, mark the run `COMPLETE` and report the outcome, verification,
  remaining risks, and recovery point.

## State format

Maintain `.agent/state/step_by_step.md` in this compact form:

```markdown
# Step-By-Step — <subject>
**Opened:** <ISO timestamp> | **Runner:** <agent> | **Status:** ACTIVE
**Model recommended:** <stay or model> | **Model observed at open:** <value>

## Situation
<the three-sentence situation>

## Plan
- [ACTIVE] 1. <title>
- [ ] 2. <title>

## Log
- <timestamp> Run opened.
```

Use only `ACTIVE`, `PAUSED`, `BLOCKED`, or `COMPLETE` for run status and only
`[ ]`, `[ACTIVE]`, `[DONE]`, or `[SKIPPED]` for plan items.
