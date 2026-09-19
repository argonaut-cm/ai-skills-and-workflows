---
name: next-step
description: Perform a read-only strategic triage of project memory and repository evidence, then recommend exactly one evidence-backed next action with scope and acceptance criteria. Use when the user invokes /next-step or $next-step, asks what to do next, or wants the highest-priority actionable item without beginning implementation.
---

# Next step

Identify one concrete project action without implementing it.

## Preserve project authority

- Follow system and developer instructions, `AGENTS.md`, and mandatory project
  skills before this workflow.
- Where a project mandates a preflight or a route declaration, complete and
  publish it before substantive inspection.
- Keep this workflow read-only. Do not edit files, allocate identifiers, deploy,
  commit, push, or start the recommended work.
- Do not import model rules, personas, issue formats, commands, or governance from
  another repository.

## Establish the evidence base

1. Read `roadmap.md`, `issues.md`, `AGENTS.md`, and the relevant current section
   of `README.md`.
2. Inspect Git status and recent history. Report a dirty worktree and avoid
   recommending work that could collide with uncommitted changes.
3. If `graphify-out/` exists, query it before rescanning architecture. Consult
   `notebooklm.md` only when the decision depends on cached methodology evidence.
4. Validate material status claims against direct evidence such as existing
   files, test output recorded in project memory, or commits. Do not mark work
   complete because a heading or filename implies completion.

If a required tracker cannot be read or materially contradicts itself, recommend
repairing that source of truth first. Do not silently reconstruct missing state.

## Select one action

Build the candidate set from unchecked roadmap outcomes, open issues, unresolved
acceptance evidence, and deferred prerequisites. Apply this order:

1. Honour an explicit priority set by the user.
2. Resolve safety, data-loss, source-of-truth, or build blockers affecting the
   active milestone.
3. Resolve an unmet prerequisite of the active milestone.
4. Choose the smallest verifiable outcome that advances the active milestone.
5. Choose later-milestone work only when the active milestone is complete or
   formally blocked.

Re-test deferred prerequisites when current repository evidence can settle them.
Classify each relevant deferred item as still blocked, decision needed, now met,
or superseded. Never describe a backlog as empty while a deferred condition is
unexamined.

For the selected action:

- identify the likely files or systems from explicit evidence;
- distinguish confirmed scope from inferred scope;
- flag overlap with other open work;
- keep MQL4 product work separate from frozen recovery tooling;
- state the exact evidence required for acceptance;
- never invent an issue ID, test result, file, command, or completion claim.

If the scope cannot be located, recommend a bounded discovery step rather than
guessing. If no actionable or deferred work remains, state that the backlog is
exhausted and request new direction instead of manufacturing a task.

## Output contract

Keep the response concise and use this structure:

```markdown
## Triage basis
- Active milestone: <name>
- Evidence checked: <sources>
- Relevant blocker or deferred condition: <result>

## Recommended next action
<one action only>

Why now: <dependency and priority rationale>
Scope: <confirmed paths/systems; label any inference>
Done when: <observable acceptance evidence>

## Suggested command
/step-by-step <plain-language task>
```

Omit the suggested command only when the recommendation requires a user decision
rather than execution. End after the recommendation; do not begin Step 1.
