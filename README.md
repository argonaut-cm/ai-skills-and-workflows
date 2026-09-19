# ai-skills-and-workflows

Canonical source for the skills and workflows used across Claude Code, Codex and
Gemini CLI -- whether run directly or inside an IDE such as AntiGravity. One
body per skill; the tools differ in where they look and which extra files they
understand, not in what the skill says.

## Why one source and not one copy per tool

Because copies drift, and the drift is invisible until the wrong runner executes
the stale one.

In the options-scanner project a churn-triage gate was added to the Claude copy
of `/debrief` and never to the `.agent/workflows` copy -- which was the one the
agent doing the debriefs actually loaded. The gap stood for six weeks and is
still open. Four hand-kept variants of a skill is that failure mode squared.

So: the skill body lives here once, `sync.ps1` publishes it, and editing a
destination by hand shows up as **drift** rather than quietly becoming the new
truth.

## Layout

```
skills/
  step-by-step/
    SKILL.md              the canonical body -- edit this
    agents/openai.yaml    Codex picker metadata (display name, default prompt)
  next-step/
    SKILL.md
    agents/openai.yaml
  graphify/
    SKILL.md
    references/           progressive-disclosure docs, loaded on demand
targets.psd1              where each tool installs, and which skills it gets
sync.ps1                  the only thing that writes to those locations
```

`targets.psd1` is a PowerShell data file rather than YAML so `sync.ps1` needs no
parser dependency -- `Import-PowerShellDataFile` is built in.

## Tools

| Target | Location | Scope | Notes |
|---|---|---|---|
| Claude Code | `~/.claude/skills/<name>/` | user | ignores `agents/openai.yaml` |
| Codex CLI | `~/.codex/skills/<name>/` | user | uses `agents/openai.yaml` for its picker |
| `project-workflows` | `<project>/.agent/workflows/<name>.md` | project | a project convention, not a tool directory |

**AntiGravity is not a target.** It is an IDE; the agents running inside it are
Claude Code, Codex and Gemini CLI, all covered above. An earlier version of the
manifest modelled it as a third tool with its own skill format, which described
something that does not exist.

**Gemini CLI has no skill directory.** There is no `~/.gemini/commands`,
`extensions` or `GEMINI.md` on this machine. When a global `GEMINI.md` exists it
belongs in `Globals` as `global/gemini/GEMINI.md`, not in the table above. It is
not stubbed, because a manifest entry with no source file claims something
exists when it does not.

Claude Code does **not** read `~/.codex/skills`, and Codex does not read
`~/.claude/skills`. A skill installed only to one is invisible to the other --
which is why a `/step-by-step` skill that existed for days never once fired in
Claude Code.

## Usage

```powershell
.\sync.ps1                                  # report drift, write nothing
.\sync.ps1 -Apply                           # install; refuses to clobber drift
.\sync.ps1 -Apply -Force                    # install, overwriting drifted files
.\sync.ps1 -Tool codex                      # one tool only
.\sync.ps1 -Apply -ProjectPath C:\repo\here # also write project-scoped tools
```

Default mode is read-only. `-Apply` without `-Force` installs anything missing
but **refuses** a destination whose content differs from source, and exits 1.
That refusal is the point: drift means someone edited the wrong file, and you
want to decide which way the change travels before it is overwritten.

Line endings are normalised before comparison, so a CRLF checkout of an LF
source does not read as drift.

## Adding a skill

**[AGENTS.md](AGENTS.md) is the contributor contract** -- read it first, whether
you are a person or an agent. It covers the layout, frontmatter, how to write a
body that stays tool-neutral, the ASCII rule for `.ps1`, and what to check
before committing. `CLAUDE.md` is a pointer to it, not a second copy.

The short version:

1. Create `skills/<name>/SKILL.md` with `name` and `description` frontmatter.
   The description is what the tool matches against, so write it as trigger
   conditions, not as a summary.
2. Add `agents/openai.yaml` if it should appear in Codex's picker.
3. Add the skill to `Skills` in `targets.psd1`, listing its tools. Omitting a
   tool is a decision -- record why in a comment, as `graphify` does.
4. Run `.\sync.ps1` to confirm, then `-Apply`.

## Globals

`global/` holds single files that configure a tool rather than add a skill.
They are listed in `Globals` in `targets.psd1` with an explicit source and
destination, and obey the same drift rules as everything else.

| Entry | Installs to | Notes |
|---|---|---|
| `claude-output-style` | `~/.claude/CLAUDE.md` | Authored 2026-09-19; the original was lost and no copy survived |

## Keeping a skill tool-neutral

Project-specific conventions do not belong in a shared skill. They were stripped
from `step-by-step` and `next-step`, which both carried a clause naming one
project's orchestration preflight -- inert in every other repository and
actively wrong in some.

Where a genuine hook is needed, state it conditionally:

> Where a project mandates a preflight or a route declaration, complete and
> publish it before substantive inspection.

If a tool needs genuinely different **behaviour** -- not different wording --
mark that block explicitly rather than forking the file.

## Provenance

`step-by-step` and `next-step` are reconstructions, rebuilt by Codex after the
13 September 2026 data loss. Treat their detail with appropriate suspicion: a
reconstruction can be fluent, internally consistent and wrong. Specific,
arbitrary conventions (control vocabulary, state-file enums, word limits) are
usually genuine; broad framing clauses are where invention hides.

If a surviving artefact ever pins one of these behaviours, record it in the file
the way the options-scanner modules do -- a header naming what was rebuilt from
what.
