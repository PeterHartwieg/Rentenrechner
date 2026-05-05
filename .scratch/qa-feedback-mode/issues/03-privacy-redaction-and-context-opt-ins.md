# Privacy redaction and context opt-ins

Status: needs-triage
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Harden the feedback report so sensitive financial/profile values are redacted by default, screenshot exports follow the agreed privacy rule, and scenario/share-link context is included only after explicit tester opt-in.

## Acceptance criteria

- [ ] User-entered profile, salary, contribution, retirement, and scenario values are excluded from reports by default.
- [ ] The screenshot export applies the minimum redaction behavior decided in issue 01.
- [ ] Scenario/share-link context is excluded by default and can only be included through an explicit reviewed opt-in.
- [ ] The report records privacy flags showing which optional context was included or omitted.
- [ ] The review preview makes privacy choices visible before export.
- [ ] Unit tests prove sensitive state is omitted by default.
- [ ] Unit tests prove optional scenario/share-link context is included only when the opt-in is set.
- [ ] Regression coverage confirms no localStorage snapshot is copied into the report payload.

## Blocked by

- .scratch/qa-feedback-mode/issues/02-screenshot-backed-local-qa-tracer-bullet.md
