# Working in this repository

Instructions for any agent — Claude, Codex, Gemini or otherwise — adding to or
changing this repository. Read this before writing a file.

## What this repository is

The canonical source for skills shared across several AI coding tools. Each
skill has **one** body. Tools differ in where they look and which extra files
they read, not in what the skill says.

Nothing here is installed by hand. `sync.ps1` is the only thing that writes to a
tool's directory.

## The rule that matters most

**Do not edit a destination.** Not `~/.claude/skills/...`, not
`~/.codex/skills/...`, not a project's `.agent/workflows/...`. Edit the file
under `skills/` and run the sync.

A destination whose content differs from source is reported as **drift**, and
`-Apply` refuses to overwrite it without `-Force`. That refusal is deliberate:
drift means someone edited the wrong copy, and which direction the change should
travel is a decision, not something a script may assume.

This exists because copies drift silently. In a sibling project a safety gate
was added to one runner's copy of a workflow and never the other's — and the
other was the runner that actually executed it. The gap stood for six weeks.

## Layout

```
skills/<name>/
  SKILL.md              the canonical body -- this is the file you edit
  agents/openai.yaml    optional; Codex picker metadata
  references/           optional; docs loaded on demand, not up front
global/<tool>/          single files that configure a tool, not skills
targets.psd1            destinations, and which skills go to which tool
sync.ps1                the only writer
```

## Adding a skill

1. Create `skills/<name>/SKILL.md`.
2. Frontmatter is `name` and `description` only:

   ```markdown
   ---
   name: my-skill
   description: What it does, then when to use it. Name the literal triggers - "use when the user invokes /my-skill, asks to X, or says Y".
   ---
   ```

   The description is what a tool matches against to decide whether to load the
   skill. Write it as **trigger conditions**, not as a summary. A description
   that only describes will not fire.

3. Add the skill to `Skills` in `targets.psd1` with its tools. Omitting a tool
   is a decision — say why in a comment, as `graphify` does.
4. Run `.\sync.ps1` to check, then `.\sync.ps1 -Apply`.

## Writing the body

**Keep it tool-neutral.** No project names, no orchestration steps particular to
one repository, no model pins. Two skills here carried a clause naming one
project's preflight by name; it was inert everywhere else and wrong in some. If
a hook is genuinely needed, state it conditionally:

> Where a project mandates a preflight or a route declaration, complete and
> publish it before substantive inspection.

**Instructions, not description.** Write what the agent must do, in the
imperative. "Verify the state, not the reported message" — not "this skill
verifies state".

**Put long material in `references/`.** The body should be readable in one pass.
Detail that is only needed sometimes goes in a reference file the skill names,
so it is loaded when required rather than always.

**Say what must not happen.** A "Do not" section catches more failures than more
description of the happy path.

If a tool needs genuinely different *behaviour* — not different wording — mark
that block explicitly. Do not fork the file.

## Conventions

- `.ps1` files are **ASCII only**. A UTF-8 em-dash in a scheduled script once
  crashed PowerShell 5.1 under the CP1252 code page. Verify by byte, not by eye.
- Markdown may use any UTF-8.
- Line endings are normalised before comparison, so a CRLF checkout of an LF
  source is not drift.
- No credentials, tokens, connection strings or personal data in any file here.
  Scan before committing.

## Reconstructed content

Some files here were rebuilt after data loss rather than recovered. Where that
is true, the file says so in a header naming what is pinned by evidence and what
is authorship.

If you reconstruct something, do the same. A reconstruction can be fluent,
internally consistent and wrong; the danger is that nobody downstream knows to
doubt it. Specific arbitrary conventions — control vocabularies, state-file
enums, numeric limits — are usually genuine. Broad framing clauses are where
invention hides.

Do not strip those headers.

## Before you commit

- `.\sync.ps1` reports everything `in sync`, or you know why not.
- No non-ASCII bytes in any `.ps1`.
- No secrets in the staged diff.
- The commit message says what changed and **why**, not just what.
