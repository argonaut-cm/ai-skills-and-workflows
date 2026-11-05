---
name: notebooklm-steward
description: Manage source-grounded NotebookLM work and retain auditable evidence. Use when the user invokes /notebooklm-steward or $notebooklm-steward, delegates recurring notebook stewardship, asks to verify NotebookLM citations, or requests a scoped NotebookLM tool and skill version audit. Use the upstream nlm-skill for ordinary commands.
---

# NotebookLM steward

Resolve the user's selected notebook and the exact task scope. Use the available
NotebookLM MCP or the existing `nlm` CLI. Read the upstream `nlm-skill` when it is
installed; it is the command reference. Where a project has an evidence or
authorization convention, follow it.

## Research and evidence

1. Check notebook/source IDs and reuse matching saved evidence. Check usage before
   extensive querying. Restrict each query to the sources that can answer it, and
   retain asynchronous query IDs; use bounded polling for long requests.
2. Treat generated answers as navigation. For each material conclusion, locate the
   actual indexed passage or authorized original page, and record source UUID and
   page, timestamp or line location. Use native passage search only if the running
   connection exposes it; otherwise retrieve source content and search locally.
3. Separate primary text, vendor documentation, derivative summaries, observations
   and inference. An image-only export or citation without a readable passage does
   not establish a formula. Keep meaningful disagreements and coverage limits.
4. Preserve complete scoped query/source responses in the authorized local evidence
   directory. In the deliverable give findings, source locators and outstanding
   questions. Keep private text, signed image links and credentials out of shared
   repositories. Do not include secret-bearing authentication diagnostics.

## Operation and maintenance boundaries

- Read/query by default. Queries may create notebook chat history. Source edits,
  imports, sharing, deletions and Studio generation need authorization for the
  selected target and operation. Do not turn a read request into a write.
- Use `ext-nlm-relogin` only for its stated authentication failures, if available.
  Do not mistake an image URL's sign-in page for an expired MCP session.
- For version checks, compare CLI, connected server, installed skill and the latest
  tagged release, not the default branch alone. Report which features are actually
  visible and which require opt-in. Do not install, upgrade or change shared
  configuration merely because an update exists.

For a requested **Codex** custom agent, use the portable
[NotebookLM researcher definition](references/notebooklm_researcher.toml).
Register it using the client's supported project agent mechanism. It inherits the
parent connection and permissions; saving the example with this skill does not
register it or grant additional access.
