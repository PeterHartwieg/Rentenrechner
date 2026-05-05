# Downloadable feedback bundle export

Status: needs-triage
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Add a reviewed local feedback bundle export for testers who cannot use clipboard workflows or repository access. The bundle should preserve the Markdown ticket, structured JSON payload, screenshot artifact, and privacy flags without sending anything over the network.

## Acceptance criteria

- [ ] A tester can download a local feedback bundle after review.
- [ ] The bundle includes the Markdown ticket.
- [ ] The bundle includes a structured JSON payload for future tooling.
- [ ] The bundle includes the screenshot artifact produced by the QA flow.
- [ ] The bundle includes privacy flags and context opt-in choices.
- [ ] The bundle filename is deterministic enough to sort by date and feedback type.
- [ ] Tests cover bundle payload contents without depending on browser-specific download UI.
- [ ] Tests or implementation checks confirm bundle export performs no network request.

## Blocked by

- .scratch/qa-feedback-mode/issues/02-screenshot-backed-local-qa-tracer-bullet.md
- .scratch/qa-feedback-mode/issues/03-privacy-redaction-and-context-opt-ins.md
