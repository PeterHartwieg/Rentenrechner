Status: ready-for-agent
Type: bug
Priority: minor
Source: local-qa
Source ref: qa-2026-05-06T12-38-13-dashboard-rentenlucke-cta-optimiere.md
Triaged: 2026-05-06T00:00:00Z

# 02 — "Optimiere deine Vorsorge" CTA overflows / wraps on wide viewport

## Problem

Tester reports the "Optimiere deine Vorsorge" button on the Rentenlücke
dashboard renders outside the visible area at viewport 2458×907 in combine
mode, view `vergleich`. The CTA group lives in
`rentenlucke-dashboard__cta-group` next to the "Lücke schließen" / "Mehr
sparen" buttons. From the screenshot the QA-feedback overlay panel is the
right-edge occluder, but the button label may also genuinely exceed its
container at this label length.

## What to change

Pick the lowest-risk fix that resolves the symptom; document the choice in the
PR. Recommended order of preference:

1. **First, reproduce.** Run `npm run dev`, open combine-mode `vergleich` view
   at 1440 / 1920 / 2458 widths. Decide whether the CTA is truly clipped by
   the dashboard container or only visually occluded by the (dev-only)
   `QaOverlay`. If it's only the overlay, see step 4.
2. **Default fix (low risk):** in the dashboard CSS, add `flex-wrap: wrap` to
   `.rentenlucke-dashboard__cta-group` so the buttons stack when horizontal
   space is tight, and `white-space: normal` (with `text-align: center` and a
   sensible `min-width`) on `.rentenlucke-dashboard__cta` so the German label
   can break across two lines without truncation. Verify the sibling "Lücke
   schließen" / "Mehr sparen" buttons still render correctly.
3. **Alternative (only if step 2 produces ugly wrapping):** shorten the label
   constant. The string lives near the top of `RentenluckeDashboard.tsx` —
   search for `Optimiere deine Vorsorge`. Treat this as a last resort because
   the label is product copy.
4. **Edge case:** if reproduction shows the QA overlay is the sole occluder
   and the dashboard renders fine without it, file a *new* curated issue
   against `src/features/qa-feedback/QaOverlay.tsx` (overlay should not
   visually obscure dashboard content; consider a translucent / collapsible
   sidebar) and close this one as `wontfix` referencing that new issue.

Do **not**:
- Restructure `Mein Plan` layout or other cross-cutting changes — that's a
  separate refactor.
- Modify the QA overlay's positioning unless step 4 applies.

## Acceptance criteria

- [ ] At viewports 1440 / 1920 / 2458 widths in combine-mode `vergleich`, the
  full "Optimiere deine Vorsorge" label is visible and the button is fully
  contained within the dashboard.
- [ ] No regression at 768 / 1024 widths (mobile / narrow desktop).
- [ ] Sibling buttons "Lücke schließen" / "Mehr sparen" still render
  correctly, no overlap or visual reflow at any tested width.
- [ ] `npm run verify` passes.

## Implementation context

- Source files:
  - `src/features/dashboard/RentenluckeDashboard.tsx` — CTA group block; class
    names `rentenlucke-dashboard__cta`, `rentenlucke-dashboard__cta-group`,
    `rentenlucke-dashboard__cta--secondary`. The "Optimiere deine Vorsorge"
    button only renders when `onOpenOptimiere` is wired (combine mode).
  - Co-located CSS: search for `dashboard.css` or `RentenluckeDashboard.css`
    next to the component.
- The "Optimiere deine Vorsorge" CTA opens `OptimiereVorsorgeModal` (the
  per-contract decision wizard); per CLAUDE.md "Decision UI" section it's
  considered shipped and load-bearing — don't move or remove it.
- `QaOverlay.tsx` is a dev-only feedback tool; not shipped to production
  users. Its position on the right edge of the screenshot is incidental.
- Tests:
  - `npx vitest run RentenluckeDashboard` (component contract).
  - Manual visual at the listed viewports in `npm run dev`.
  - `npm run verify` before PR.

## Blocked by

Nothing.

## Original report

.scratch/archive/qa-feedback-issues/qa-2026-05-06T12-38-13-dashboard-rentenlucke-cta-optimiere.md
.scratch/archive/qa-feedback-issues/qa-2026-05-06T12-38-13-dashboard-rentenlucke-cta-optimiere-screenshot.png
