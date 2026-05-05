# Accessible mobile-safe QA composer

Status: needs-triage
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Make the QA feedback overlay and composer usable with keyboard and mobile viewport sizes, including focus handling, cancel behavior, responsive placement, and screenshot preview ergonomics.

## Acceptance criteria

- [ ] QA mode indicator and composer controls are keyboard reachable.
- [ ] A keyboard user can create, review, export, and cancel a report.
- [ ] Focus moves predictably into the composer and returns safely when the draft is cancelled or exported.
- [ ] The composer does not cover the selected element unnecessarily on common desktop and mobile viewport sizes.
- [ ] Screenshot preview remains usable on mobile.
- [ ] The overlay does not trap focus incorrectly.
- [ ] Component tests cover cancel behavior, keyboard submission, and focus management.
- [ ] Visual smoke checks cover at least one desktop and one mobile viewport.

## Blocked by

- .scratch/qa-feedback-mode/issues/02-screenshot-backed-local-qa-tracer-bullet.md
