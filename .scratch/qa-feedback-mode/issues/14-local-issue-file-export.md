# Local issue file export for repo-based QA

Status: done
Type: feature
Priority: major

## Parent

.scratch/qa-feedback-mode/PRD.md

## Problem

The current export paths (clipboard Markdown, file download, mailto) require manual steps to get a QA report into the project's local issue tracker (`.scratch/` markdown files). For local QA sessions, a tester should be able to create an issue file directly in the repo without copy-pasting.

## Approach — File System Access API (Option B)

Decision: use the browser-native File System Access API (`showDirectoryPicker()` / `FileSystemDirectoryHandle`). No server code, no Vite plugin, no backend boundary blur. Chrome/Edge only — acceptable because QA environment is controlled.

On first save per session, the tester grants directory access to `.scratch/qa-feedback-mode/reports/` via the native picker. The handle is cached in memory for the session so subsequent saves are one-click. Falls back to the existing file download on browsers that don't support the API.

## What to build

1. **Directory handle manager** — In `src/features/qa-feedback/export/localDirectoryHandle.ts`: acquire, cache (in-memory, session lifetime), and write to a `FileSystemDirectoryHandle`. Expose `acquireReportsDirectory()` (shows picker on first call, returns cached handle after) and `saveToDirectory(handle, filename, content)`. For screenshot artifacts, write the PNG alongside the `.md` file.

2. **Export adapter** — In `src/features/qa-feedback/export/localSave.ts`: takes a `FeedbackReport` + optional screenshot, calls the directory handle manager, writes a `.md` file with issue-tracker frontmatter and the screenshot as a sibling file.

3. **QaPreview** — Add a "Lokal speichern" button next to the existing export buttons. Visible when `window.showDirectoryPicker` is available (feature-detect, not env-flag). On first click, triggers the directory picker; on subsequent clicks, writes directly.

4. **Issue filename** — `qa-<ISO-timestamp>-<target-slug>.md` with frontmatter (Status: needs-triage, Type mapped from feedback type, Parent pointer to PRD).

5. **Fallback** — When `showDirectoryPicker` is unavailable (Firefox, Safari), the button is hidden and the existing download export remains the path.

## Acceptance criteria

- [ ] A "Lokal speichern" button appears in QA preview on Chrome/Edge.
- [ ] First click opens the native directory picker; tester selects the reports folder.
- [ ] Subsequent clicks in the same session save directly without a picker.
- [ ] Written file follows the project's issue-tracker format with frontmatter.
- [ ] Screenshot artifact is saved alongside the issue file when included.
- [ ] Button is hidden on browsers without `showDirectoryPicker` support.
- [ ] Existing download/clipboard export paths are unaffected.
- [ ] No network requests, no server code, no Vite plugin.

## Blocked by

Nothing — standalone feature.
