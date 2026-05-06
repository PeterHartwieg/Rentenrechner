# Finer selection granularity for QA targets

Status: done
Type: enhancement
Priority: major

## Parent

.scratch/qa-feedback-mode/PRD.md

## Problem

Current `data-qa-target` instrumentation is placed at section/container level. When a tester hovers, the highlight outline covers an entire panel or workspace section — essentially the whole visible area. This defeats the purpose of precise feedback: the tester still has to describe *which* element within the section they mean.

The PRD user stories (US-5, US-6) call for clicking individual labels, inputs, buttons, chart labels, and table cells. The Phase 1 tracer bullet intentionally kept instrumentation minimal to avoid merge conflicts with active QA fixes (PHASE-PLAN §Phase 3, Lane G). Now that Phase 1 has landed, it's time to push targets down to leaf-level elements.

## What to change

1. **Shared input primitives** — Add `data-qa-target` to `NumberField`, `InfoTip`, select/radio groups in `src/ui/`. Each should carry a semantic id like `inputs.bav.employerSubsidy.field`.

2. **Product input sections** — Push targets from section containers down to individual field labels and inputs in `src/features/inputs/sections/` and per-product input components.

3. **Result/chart surfaces** — Add targets to:
   - Individual `<ResultMetric>` instances in `ResultsPanel`.
   - Chart legend items in `BreakEvenChart`, `FeeDragChart`.
   - Table column headers and row labels in comparison tables.

4. **Workspace chrome** — Product tab labels, mode toggle, guided-setup step labels.

5. **`useFeedbackTarget` hook** — May need a convenience prop pattern so instrumenting a leaf component is a one-liner (e.g. `{...qaTarget('inputs.bav.contribution')}` spreading data-attributes).

6. **Overlay** — Verify that finer targets still resolve correctly via `closest()` — a click on a child of a `NumberField` that itself carries `data-qa-target` should resolve to that field, not the section ancestor.

## Acceptance criteria

- [ ] Hovering in QA mode highlights individual inputs, labels, buttons, and chart items — not entire panels.
- [ ] At least the top-used input fields (bAV, ETF, insurance contribution/fee fields) have leaf-level targets.
- [ ] At least one chart legend item and one result metric are individually selectable.
- [ ] Section-level fallback still works for areas not yet instrumented at leaf level.
- [ ] Existing QA overlay and composer tests still pass.

## Blocked by

Nothing — builds on existing instrumentation from issue 04.
