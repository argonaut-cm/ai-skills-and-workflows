# Companion project and upstream integration

The reusable local helpers and templates live in the private [course-to-notebooklm](https://github.com/argonaut-cm/course-to-notebooklm) repository; access is required to obtain them. Keep code there and this tool-neutral workflow here. Do not copy actual course content into either Git history.

The companion CLI initializes course manifests, validates local inputs, exports complete timed captions, copies AAC audio into M4A and extracts explicitly selected frames with provenance. It requires Python 3.10 or newer and FFmpeg for media operations. It does not automatically download from arbitrary websites, perform speech-to-text, build combined PDFs or upload sources. Read that project's README for current commands and limits.

Use [jacob-bd/gemini-notebook-mcp-cli](https://github.com/jacob-bd/gemini-notebook-mcp-cli) for NotebookLM integration. Keep its `nlm-skill` managed upstream, rather than vendoring a second copy into this repository. This repository's `sync.ps1` owns the custom `course-to-notebooklm` skill only; it does not manage or overwrite `nlm-skill`.

For a new environment:

1. Follow the upstream README for installation and MCP connection. Do not reinstall a working integration merely to use this workflow.
2. Inspect `nlm --help`, `nlm setup --help` and `nlm skill install --help` for installed behavior. `nlm setup` offers guided setup. The installed CLI can also install the upstream skill into its supported AI-tool target; select a target shown by local help. For example, where supported, `nlm skill install agents --level user` installs into the shared agents skill location.
3. Confirm that the AI runner discovers `nlm-skill` and the required MCP tools. Setup/authentication data stays outside Git. Test with a read-only operation against the intended account before a requested import.

Updates to the upstream skill follow its own setup/installation mechanism. Keep local custom changes in this workflow or project instructions so upstream updates do not erase them. If a command differs from upstream documentation, use installed help rather than guessing flags or silently replacing the integration.
