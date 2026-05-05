# Capture workspace and flow context

Status: needs-triage
Type: AFK

## Parent

.scratch/qa-feedback-mode/PRD.md

## What to build

Enrich QA feedback reports with enough non-sensitive app context to reproduce flow-specific feedback: active route, workspace view, selected scenario/product context, open modal/disclosure/guided step where available, and fallback precision when the target is section-level.

## Acceptance criteria

- [ ] Reports include current route.
- [ ] Reports include current workspace tab/view when the calculator workspace is active.
- [ ] Reports include active product and scenario context where that context is already visible and non-sensitive.
- [ ] Reports include modal, disclosure, or guided setup step context where available.
- [ ] Reports label target precision as exact, nested, section fallback, or unknown.
- [ ] Context capture remains read-only and does not trigger simulation reruns.
- [ ] Tests cover representative reports from inputs, comparison, details/export, and guided setup surfaces.

## Blocked by

- .scratch/qa-feedback-mode/issues/02-screenshot-backed-local-qa-tracer-bullet.md
