# Screenshot-backed local QA tracer bullet

Status: needs-triage
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Build the first complete local-only QA feedback path: a tester enables QA mode, selects one instrumented UI target, writes feedback, captures a screenshot, previews the report, and exports a Markdown ticket plus the screenshot without any backend submission.

## Acceptance criteria

- [ ] QA mode can be explicitly enabled according to the policy from issue 01.
- [ ] With QA mode enabled, at least one real reusable UI target can be hovered, selected, and pinned.
- [ ] With QA mode disabled, the same screen behaves like the normal calculator experience.
- [ ] The composer captures feedback type, severity, comment, optional suggested text, target id, and current visible text.
- [ ] A client-side screenshot is captured during the feedback flow and shown in the review preview.
- [ ] The review preview includes route, workspace view if known, viewport, browser family, app/build metadata if available, timestamp, and privacy flags.
- [ ] The tester can cancel a draft without persisting state or changing calculator data.
- [ ] The tester can export a local Markdown ticket and a screenshot artifact in the first implementation.
- [ ] The ticket payload builder is covered by unit tests for title generation, Markdown generation, missing optional fields, and selected target metadata.
- [ ] Tests or implementation checks confirm the first tracer bullet performs no network request.

## Blocked by

- .scratch/qa-feedback-mode/issues/01-lock-qa-mode-policy-and-target-id-convention.md
