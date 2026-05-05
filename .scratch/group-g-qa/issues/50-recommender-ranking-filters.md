---
title: "Add Beste Option fuer ranking filters to the recommender result step"
Status: done
Severity: P1
Type: AFK
Area: recommender / ranking UX
---

## What to build

Replace generic recommendation language with filter-specific `Beste Option fuer ...` labels. The highlighted winner changes when the user changes the active filter.

Default filter is highest median monthly net pension.

## Acceptance criteria

- [ ] Result step has a segmented control or equivalent compact control for ranking filters.
- [ ] Default selected filter is `Beste Option fuer hoechste mittlere Netto-Rente`.
- [ ] Supported filters are:
  - [ ] hoechste mittlere Netto-Rente
  - [ ] hoechstes Kapital bei Renteneinstieg
  - [ ] Sicherheit
  - [ ] Flexibilitaet
  - [ ] wenig Aufwand
- [ ] The highlighted winner label always includes the active criterion, e.g. `Beste Option fuer Sicherheit`.
- [ ] `Sicherheit` ranks by 90%-floor monthly net pension, not by P10 capital.
- [ ] The result card shows the metric that caused the option to win.
- [ ] The UI avoids generic `Empfehlung` as the primary label.
- [ ] Tests cover default sorting, each filter changing the highlighted winner when fixture data differs, and the safety filter using P10 monthly net pension.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/app/recommender.ts`
- `src/features/dashboard/RecommenderCard.tsx` or the new modal result component from issue 49
- `src/features/dashboard/RecommenderCard.test.tsx`

Use consumer wording in the standard result step. Detailed metric jargon can live in tooltips.

## Blocked by

- Issue 49 - modal recommender flow shell.
