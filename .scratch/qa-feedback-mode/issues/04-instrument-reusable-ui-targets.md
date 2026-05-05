# Instrument reusable UI targets

Status: done
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Add stable feedback target coverage to reusable UI primitives and high-traffic input/result sections so testers can report nested labels, fields, hints, and controls without manually describing where they are.

## Acceptance criteria

- [ ] Reusable numeric inputs can expose stable feedback target ids for their label, control, and help/error text where applicable.
- [ ] Reusable info/help surfaces can expose stable feedback target ids.
- [ ] Reusable product input sections can expose stable feedback target ids without duplicating QA-mode logic in every host component.
- [ ] Main workspace sections have section-level fallback targets for non-instrumented child nodes.
- [ ] Target ids follow the convention from issue 01.
- [ ] Target resolution works for exact targets, nested children, section fallbacks, and unknown targets.
- [ ] Tests cover target resolution behavior without requiring broad snapshots of every target.

## Blocked by

- .scratch/qa-feedback-mode/issues/01-lock-qa-mode-policy-and-target-id-convention.md
- .scratch/qa-feedback-mode/issues/02-screenshot-backed-local-qa-tracer-bullet.md
