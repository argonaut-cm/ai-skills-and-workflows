---
name: course-to-notebooklm
description: Prepare course videos, complete timed transcripts and contextual frames for NotebookLM. Use when the user invokes /course-to-notebooklm, asks to transcribe course lessons for study, or asks to import prepared lesson materials into NotebookLM.
---

# Course to NotebookLM

Work directly with the requested course material. Preserve the course's lesson order, original URLs, caption provenance and exact cue/frame timestamps. Keep original course captions distinct from generated notes or speech recognition.

## Prepare the course

- Inspect the selected course manifest and existing preparation/upload records before acquiring or exporting files. Give each course its own folder and an explicitly selected notebook destination.
- Obtain accessible video and caption files through the site's supported media capabilities or user-provided files. Prefer complete course-provided captions. When captions are unavailable, establish a transcription method before claiming a complete transcript.
- Export every caption cue, including the beginning and end, as timestamped text. Select useful diagrams, slides or chart examples from the actual video; record each frame's lesson URL and exact time.
- For a combined study PDF, preserve the complete transcript as well as the selected frames. Verify caption coverage and render the PDF to inspect readable text, charts and page layout. A source upload does not establish transcript completeness or image interpretation.
- Keep originals under `source/`, finished files under `exports/`, and intermediate files under `work/`. Use the companion project's helpers when available; read [references/setup.md](references/setup.md) for their scope and integration setup.

## Import and verify

For NotebookLM operations, load the installed upstream `nlm-skill` and follow current tool schemas. Prefer the connected MCP when it supports the requested operation. Where agent delegation is available and authorized, reuse a NotebookLM specialist and supply [references/notebooklm-manager.md](references/notebooklm-manager.md), the selected course and the user's request. Otherwise apply that brief directly.

Refresh live sources immediately before adding material. Compare titles, IDs and content with the saved upload record; concurrent changes can rename or replace a source. Inspect ambiguous matches before creating another copy. Import the requested formats into the selected notebook, then verify processing and indexed content separately. Record actual source IDs, results and any coverage limits. Retain partial successes if a later import fails.

An upload request for study PDFs does not also request video or audio sources. Carry the user's chosen formats and existing authorization through the workflow. For video-derived recognition, verify relevant content without assuming exact equality with the original captions.

## Do not

- Resume an application-building task when the requested deliverable is course study material.
- Infer a new course's notebook from the previous course, bypass access controls, or remove unrelated sources to make room.
- Put purchased media, transcripts, frames, signed media URLs, notebook records or credentials in a source-code repository.
- Retry an uncertain upload or generation blindly, upgrade integrations as routine course work, or expand the task to sharing, deletion, Studio generation or monitoring without a corresponding request.
