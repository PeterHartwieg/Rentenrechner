---
title: "Make Risiko-Check consumer-facing and median-rente-first"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: Monte Carlo / Risiko-Check / results
---

## What to build

Rework the standard Risiko-Check overview so it focuses on monthly net pension, avoids P10 jargon, and places the important value directly under the visual indicator.

Detailed/expert surfaces may retain P10/P50/P90 if explained.

## Acceptance criteria

- [ ] Overview says `1.000 Simulationen`, not `1.000 Pfade`.
- [ ] Standard overview does not lead with `P10`.
- [ ] Standard wording uses `90 % der Simulationen lagen ueber X`.
- [ ] Main overview metric is median monthly net pension.
- [ ] The median net pension value appears directly under or visually attached to the indicator.
- [ ] Safety/downside line uses monthly net pension by default.
- [ ] Capital remains available only in detailed/expert Monte Carlo surfaces.
- [ ] Guarantee products show one guarantee line under the indicator:
  - [ ] `Garantie: mind. X EUR Kapital zum Rentenbeginn` for capital floors.
  - [ ] `Garantierte Rente: mind. Y EUR/Monat` for guaranteed annuity mode.
- [ ] If both guarantee types exist, the line matches the selected payout mode.
- [ ] Existing detailed table can keep P10/P50/P90 but includes plain-language explanation.
- [ ] Tests assert the consumer labels and absence of P10 jargon in overview.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/features/results/MonteCarloHighlights.tsx`
- `src/features/results/MonteCarloPanel.tsx`
- `src/engine/monteCarlo.ts` if P10 monthly net pension needs to be surfaced more directly

Keep the overview visual and compact. Move longer explanation into InfoTip or details.

## Blocked by

None - can start immediately.
