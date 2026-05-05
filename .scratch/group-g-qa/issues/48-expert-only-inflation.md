---
title: "Move inflation to expert details and keep standard mode inflation-free"
Status: done
Severity: P1
Type: AFK
Area: assumptions / expert mode / charts
---

## What to build

Remove inflation from standard mode. Standard/default scenarios should run with 0% inflation and expose no inflation input, real-value toggle, or "heutige Kaufkraft" framing.

Inflation becomes an expert/details assumption. When the expert toggle is switched on, the rate defaults to 2% and is editable.

## Acceptance criteria

- [ ] New/default standard scenarios use `inflationRate: 0`.
- [ ] The main `Eingaben` panel no longer shows an `Inflation` input.
- [ ] Standard top-level charts do not expose a nominal/real toggle or `inflationsbereinigt` control.
- [ ] Details / Annahmen / Expertenannahmen expose `Inflation beruecksichtigen`.
- [ ] Turning expert inflation on sets the rate to 2% unless the user already has an explicit expert value.
- [ ] Turning expert inflation off sets the active modeled inflation to 0%.
- [ ] Exports still disclose the active inflation assumption.
- [ ] Saved scenarios and migrated state load safely when old data contains `inflationRate: 0.02`.
- [ ] Tests cover standard default 0%, expert toggle on to 2%, and export disclosure.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Likely surfaces:

- `src/data/defaultScenario.ts`
- `src/features/inputs/InputsPanel.tsx`
- `src/features/workspace/ScenarioToolbar.tsx`
- `src/features/results/PrintReport.tsx`
- `src/utils/csvExport.ts`
- scenario/storage migration tests

Do not add a top-level nominal/real chart toggle as part of this issue.

## Blocked by

None - can start immediately.
