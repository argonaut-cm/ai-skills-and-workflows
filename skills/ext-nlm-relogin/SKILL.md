---
name: ext-nlm-relogin
description: Re-authenticate the NotebookLM MCP server after its credentials expire. Use when any NLM MCP call returns "Authentication expired. Run 'nlm login'", when nlm login reports a circular expired-state error, or when it fails with "Cannot connect to browser on port 9223".
---

<!--
Frontmatter added 2026-09-19. The file had none, so no tool could match it by
description and it could only ever be invoked by name. The body is unchanged.
-->

# /ext-nlm-relogin — NotebookLM MCP Re-Authentication

Use when any NLM MCP call returns `Authentication expired. Run 'nlm login'...`

## Background

- `nlm login --force` writes to `~/.nlm/` — outside the §10 immutable blacklist.
- **Always use `--force`**: plain `nlm login` detects the expired state and bails before opening a browser, producing a circular error. `--force` bypasses the expired-state check and opens a fresh OAuth flow directly.
- OAuth uses the PM's existing Chrome Google session, which auto-authorizes the flow with **no human input** on this machine — so AG drives `nlm login --force` itself via the terminal (PM-directed 2026-06-20, EHQ override of the §10 manual-only posture). No PM terminal step, no HALT.
- After login, call `refresh_auth` MCP tool to push new credentials into the running server — do not ask the PM to do this.
- **ALL Chrome processes must be closed before `nlm login` runs.** `nlm` spawns Chrome with a
  remote-debugging port; if any Chrome instance is already running, the new process hands off to
  it and exits code 0, so the debug port never binds. This surfaces as the misleading
  `Error: Cannot connect to browser on port 9223`. Closing Chrome is the fix — not a port change.
- **Known upstream bug (2026-07-24, notebooklm-mcp-cli 0.9.2):** Google serves the *authenticated*
  session at `notebook.google.com` (Gemini Notebook rebrand), but `_is_notebooklm_url()` in
  `notebooklm_tools/utils/cdp.py` allowlists only `notebooklm.google.com` /
  `notebooklm.cloud.google.com`. `is_logged_in()` therefore never matches a signed-in tab and
  login hangs the full 300s. A local patch adding `notebook.google.com` to that host set is
  applied on this machine — **`uv tool upgrade notebooklm-mcp-cli` silently reverts it.**
  Note the unauthenticated redirect runs the other way (new → old), so a `curl` of the bare
  domain will *not* reveal this; only a live tab URL does.

## Steps

**1. Probe current auth state.**

Call `mcp_notebooklm_notebook_list`. If it returns notebooks, output `[NLM] Auth is healthy — no relogin needed.` and HALT.

If it errors with `Authentication expired`, proceed.

**2. Close Chrome, then drive the login automatically.**

Run via the terminal (no PM step, no HALT). Close every Chrome process first — graceful close
first, so session restore returns the PM's tabs:

```powershell
Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { $null = $_.CloseMainWindow() }
Start-Sleep -Seconds 4
$r = Get-Process chrome -ErrorAction SilentlyContinue; if ($r) { $r | Stop-Process -Force }
nlm login --force
```

Chrome auto-completes the OAuth against the existing Google session. `nlm login` blocks up to 300s
waiting for sign-in. On success the output ends with `✓ Successfully authenticated!` and a cookie
count; proceed straight to step 3. Only if `nlm login --force` exits non-zero, output
`[NLM RELOGIN FAILED] nlm login --force exited non-zero — see output above.` and HALT.

**2a. If the output shows repeated `Still waiting for sign-in...` despite a signed-in window.**

Do not retry — the host allowlist bug is the likely cause. Read the live tab URLs to confirm what
the detector actually sees (note `nlm` may bind CDP on **9222** even when the error text says 9223;
resolve the real port via `Get-NetTCPConnection -State Listen` against the chrome PIDs):

```powershell
curl -s http://127.0.0.1:9222/json | python -c "import sys,json; [print(t.get('url','')[:150]) for t in json.load(sys.stdin)]"
```

If the signed-in tab is on a host absent from `_is_notebooklm_url()` (see Background), add that host
to the set in `notebooklm_tools/utils/cdp.py` under the uv tool's `site-packages`, then re-run step 2.

**3. Auto-refresh MCP credentials.**

Immediately call `mcp_notebooklm_refresh_auth` (no params) to push the new tokens into the running server.

**4. Verify.**

Call `mcp_notebooklm_notebook_list` again. If it succeeds:

```
[NLM] Re-authentication complete. <N> notebooks accessible. Safe to resume research.
```

If it still errors:

```
[NLM RELOGIN FAILED] refresh_auth ran but auth probe still failing.
Possible causes:
  - nlm login --force exited non-zero (check the step-2 output)
  - Profile mismatch — run `nlm login switch <profile>` then retry
  - Restart the IDE and re-run /ext-nlm-relogin
  - Host allowlist reverted by a `uv tool upgrade` — re-apply the cdp.py patch (see Background)
```

HALT.

## Notes

- Do NOT touch `~/.notebooklm-mcp-cli/`, `~/.notebooklm-mcp-cli/profiles/`, or `nlm_profile.json` — Constitution §2 Hard Halt trigger. Only `nlm login --force` (which writes to `~/.nlm/`) is the authorized auto-driven path.
- If `nlm login --force` returns non-zero, surface the failure and HALT — never retry blindly in a loop.
- After successful relogin, the research workflow can resume from where it left off — the CLI fallback (Strike 3) will have preserved any results already obtained.
