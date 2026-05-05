# Downloadable feedback bundle export

Status: done
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Add a reviewed local feedback bundle export for testers who cannot use clipboard workflows or repository access. The bundle should preserve the Markdown ticket, structured JSON payload, screenshot artifact, and privacy flags without sending anything over the network.

## Acceptance criteria

- [x] A tester can download a local feedback bundle after review.
- [x] The bundle includes the Markdown ticket.
- [x] The bundle includes a structured JSON payload for future tooling.
- [x] The bundle includes the screenshot artifact produced by the QA flow.
- [x] The bundle includes privacy flags and context opt-in choices.
- [x] The bundle filename is deterministic enough to sort by date and feedback type.
- [x] Tests cover bundle payload contents without depending on browser-specific download UI.
- [x] Tests or implementation checks confirm bundle export performs no network request.

## Blocked by

- .scratch/qa-feedback-mode/issues/02-screenshot-backed-local-qa-tracer-bullet.md
- .scratch/qa-feedback-mode/issues/03-privacy-redaction-and-context-opt-ins.md
