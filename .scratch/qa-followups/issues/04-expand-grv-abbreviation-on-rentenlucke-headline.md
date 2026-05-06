Status: ready-for-agent
Type: copy
Priority: nit
Source: local-qa
Source ref: qa-2026-05-06T12-40-43-dashboard-rentenlucke-metric-projected.md
Triaged: 2026-05-06T00:00:00Z

# 04 — Expand "GRV" to a full word on the Rentenlücke "Voraussichtlich" metric

## Parent

.scratch/qa-followups/

## Problem

In the Rentenlücke dashboard headline metric "Voraussichtlich (mtl.)", the
sub-line currently reads e.g. `GRV 1.964 € + 2 Produkte`. A tester points out
that "GRV" is not always self-explanatory (the abbreviation refers to the
*Gesetzliche Rentenversicherung*) and asks for the full word. The same
dashboard's legend two paragraphs lower already uses the friendlier label
"Gesetzl. Rente: …" via the `segments` array, so the headline is the lone
spot still leaning on the bare initialism.

## What to change

In `src/features/dashboard/RentenluckeDashboard.tsx`, change the `<small>`
inside the `dashboard.rentenlucke.metric.projected` block (currently line 119)
from:

```
GRV {formatCurrency(grvNet, 0)}
```

to (recommended, matches the existing legend wording in the same component):

```
Gesetzl. Rente {formatCurrency(grvNet, 0)}
```

Acceptable alternative if product copy prefers the long form:
`Gesetzliche Rentenversicherung {formatCurrency(grvNet, 0)}` — but note this is
visibly longer in the small metric tile and may push the
`+ 2 Produkte` suffix to a second line.

Do **not** change the JSDoc comment at the top of the file (line 5 —
"projected total monthly net retirement income (GRV + each portfolio …)") —
that's an internal code comment, not user-visible copy.

## Acceptance criteria

- [ ] The Rentenlücke dashboard headline metric's secondary line shows the
  expanded form (e.g. "Gesetzl. Rente 1.964 € + 2 Produkte") at all
  viewports, matching the wording already used in the legend.
- [ ] No layout regression — text fits the metric tile without an unwanted
  line break in standard viewports.
- [ ] No engine / number changes; this is pure presentation copy.
- [ ] Tests still green: `npx vitest run RentenluckeDashboard` then
  `npm run verify`.

## Implementation context

- File: `src/features/dashboard/RentenluckeDashboard.tsx` (~line 119, inside
  the `<small>` of the projected metric tile).
- The `segments` array a few lines above (line ~98) already labels the GRV
  segment as "Gesetzl. Rente". Reusing that wording keeps the tile and legend
  consistent.
- Co-located CSS: any change should fit existing `rentenlucke-dashboard__metric`
  styling; no CSS edit expected for the recommended short form.
- Tests:
  - `npx vitest run RentenluckeDashboard` for component snapshot/contract.
  - `npm run verify` before opening a PR.
- HITL check: `src/features/dashboard/**` is **not** in the RUNBOOK hard-rule
  list. No engine, rules, storage, registry, or legal/disclaimer surface is
  touched. Single-file copy fix → `ready-for-agent` is appropriate.
- Severity downgraded from the tester's "Minor" to `nit` because the
  abbreviation is widely understood among German users and the fix is
  ergonomic, not a defect.

## Blocked by

Nothing.

## Open questions

Not applicable.

## Original report

.scratch/archive/qa-feedback-issues/qa-2026-05-06T12-40-43-dashboard-rentenlucke-metric-projected.md
(no screenshot was attached)
