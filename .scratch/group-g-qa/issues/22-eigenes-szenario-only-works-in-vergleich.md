---
title: "\"Eigenes Szenario\" only works in Vergleich mode, not in Mein Plan"
Status: wontfix
Area: Group G / scenarios / combine mode
---

## Description

The custom return scenario ("eigenes Szenario") can only be configured / used in Vergleich (compare) mode. In Mein Plan (combine) mode the option is either missing, disabled, or has no effect — so a user who has actually entered their portfolio cannot stress-test it under a custom return assumption.

## Steps to reproduce

1. Switch to Mein Plan mode.
2. Open the scenario picker / assumptions panel.
3. Try to select or define a custom scenario — option is unavailable, or selecting it does not propagate to the dashboard / charts.

## Expected

Custom scenarios are a first-class assumption available in **both** modes:

- In Mein Plan mode the custom scenario applies to `simulatePortfolio` exactly as it does to `simulateRetirementComparison` in compare mode.
- All combine-mode visualizations (dashboard, per-instance charts, exports) update when the scenario changes.

## Notes

`assumptions.returnScenarios` is on the singleton state. Combine mode reads its own context via `usePortfolioState` / `simulatePortfolio`. Verify that the portfolio simulation path actually passes the user-selected scenario (including `custom`) through to `buildContext` and downstream simulators. See `src/app/useSimulationResult.ts`, `src/app/portfolioState.ts`, and the scenario selector wiring in `simulationSelectors.ts`.

Related: #08 (scenario change not propagating to "nächster Euro" panel) — same family of bug, different surface.

## Comments

**Round-2 verification (2026-05-04) — covered by QA #25, closing as wontfix.**

The fix for this issue was fully delivered by the two QA #25 commits on branch `main`:

- `c7afdc9 fix(combine): scenario toolbar reads/writes workspace assumptions (#25)` — wired
  `ScenarioToolbar` in combine mode to `portfolioState.patchBaseline` instead of singleton
  `setAssumptions`, so custom scenario edits land in `workspace.baseline.assumptions.returnScenarios`
  which is what `useCombineSimulation` / `runCombineSimulation` reads.
- `dbeeb41 fix(combine): resolve effectiveScenarioId against workspace in combine mode (#25 round 2)` —
  introduced `combineEffectiveScenarioId` in `App.tsx`, resolved against workspace scenarios so the
  toolbar pill highlights correctly after a custom scenario is added.

The propagation chain is fully closed:
  workspace `returnScenarios` → `simulatePortfolio` (iterates per-instance) → `runCombineSimulation`
  (iterates `wsa.returnScenarios` for `combinedByScenarioId`) → `combineEffectiveScenarioId` →
  `combineBasisScenarioId` → dashboard / `CombineIncomePanel` / `RecommenderCard`.

QA #25 added 5 regression tests to `src/app/useCombineSimulation.test.ts` (describe blocks at lines
299–474 in the post-fix file) covering: custom scenario in workspace appears in `combinedByScenarioId`;
different `annualReturn` values produce different combined nets; `resolveCombineEffectiveScenarioId`
resolves against workspace (not singleton); and end-to-end toolbar→dashboard path.

**QA #22 regression test added** (this verification round): one additional test in the describe block
`runCombineSimulation — custom 0% scenario propagates through simulatePortfolio (QA #22)` pins the
0%-return degenerate case — a custom scenario at `annualReturn=0` on a workspace with an ETF instance
must produce a strictly lower `combinedByScenarioId['custom'].monthlyNetIncome` than the same workspace
at 7%, proving the return rate actually flows through `simulatePortfolio`. All 15 tests pass.
