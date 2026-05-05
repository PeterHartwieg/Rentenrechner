# Prefilled outbound destinations without API calls

Status: needs-triage
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Add optional outbound helpers that use reviewed local ticket content to open destinations such as `mailto:` or a prefilled issue URL, without authentication, backend submission, or direct issue creation through an API.

## Acceptance criteria

- [ ] The chosen outbound destination from issue 01 is implemented as a post-review action.
- [ ] The outbound payload is generated from the same reviewed ticket content as the local export.
- [ ] The action does not require authentication.
- [ ] The action does not call a backend or direct issue API.
- [ ] The UI clearly distinguishes local export from opening an external destination.
- [ ] Tests cover URL/body generation and encoding.
- [ ] Tests or implementation checks confirm no API call is made.

## Blocked by

- .scratch/qa-feedback-mode/issues/01-lock-qa-mode-policy-and-target-id-convention.md
- .scratch/qa-feedback-mode/issues/07-downloadable-feedback-bundle-export.md
