# Harden no-network and inert-disabled guarantees

Status: needs-triage
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Add regression coverage and implementation hardening so QA mode cannot weaken the app's privacy posture or normal calculator behavior. This is the release-hardening slice for the local-only QA feedback feature.

## Acceptance criteria

- [ ] With QA mode disabled, normal UI rendering remains unchanged for representative screens.
- [ ] With QA mode disabled, calculations, simulation reruns, localStorage behavior, share-link behavior, CSV export, PDF/print report structure, and disclaimer session behavior remain unchanged.
- [ ] QA mode exports perform no network requests.
- [ ] QA mode does not add cookies, telemetry, auth, or backend calls.
- [ ] QA mode does not persist report drafts across browser sessions unless a later issue explicitly changes that scope.
- [ ] The no-backend/no-telemetry guarantee is documented near the feature or in developer-facing notes.
- [ ] Regression tests fail if a future change introduces network submission in the local-only path.

## Blocked by

- .scratch/qa-feedback-mode/issues/02-screenshot-backed-local-qa-tracer-bullet.md
- .scratch/qa-feedback-mode/issues/03-privacy-redaction-and-context-opt-ins.md
- .scratch/qa-feedback-mode/issues/07-downloadable-feedback-bundle-export.md
- .scratch/qa-feedback-mode/issues/08-prefilled-outbound-destinations-without-api-calls.md
