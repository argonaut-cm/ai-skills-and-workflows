# Source Collector verification record

The generic runtime, dependency lock, independent example profile, tests and tool-neutral canonical skill are prepared in this checkout. Project-specific profiles, captures and downloaded packages are excluded because this repository is public.

The source engine and tests were byte-compared with the previously verified implementation. The shared copy subsequently passed its own locked dependency installation and all eight integration tests, with zero failures or skipped tests. The run included an isolated headless Edge rendering check. Runtime source hashes were verified independently.

The unchanged repository sync script passed report, Apply and report checks against isolated Claude and Codex destinations; both finished in sync and their files were byte-compared with the canonical source. No global installation was performed. The actual Codex dry run reported the new skill as missing and pre-existing Graphify drift; that unrelated state was preserved.

An earlier attempt was deferred by an automatic-approval account usage limit and a sandbox PowerShell authorization error. The resumed checks used normal approved host access without changing execution policy or bypassing review. The existing course-workflow branch was preserved by using a separate worktree.

Before future publication, review the exact diff and repository visibility. Do not force synchronization over drift, globally install skills as part of a storage request, or add project captures, signed URLs, credentials or downloaded third-party payloads to this public repository.
