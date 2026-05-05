---
title: "BLOCKER: Combine-mode scenario toolbar mutates singleton compare state"
Status: done
Severity: blocker
Area: Group G / combine mode / scenarios
---

## Description

The toolbar rendered in combine mode is built with singleton `assumptions`, singleton `setAssumptions`, and singleton `result.effectiveScenarioId` ([App.tsx:247](src/App.tsx)). `ScenarioToolbar` adds/removes custom scenarios and edits Monte Carlo through that callback ([ScenarioToolbar.tsx:34](src/features/workspace/ScenarioToolbar.tsx), [ScenarioToolbar.tsx:61](src/features/workspace/ScenarioToolbar.tsx)).

But combine simulation reads only `portfolioState.workspace`. When `custom` is selected but not present in the workspace scenario list, `combineSelectedScenarioId` falls back to `basis` while the UI selection can still show `custom` ([App.tsx:262](src/App.tsx)).

## Impact

Markus / Lena can adjust the scenario or MC sliders in "Mein Plan" and see no change in combined income or the next-€ recommender. The #08 fix made scenario switching react when the scenario exists in workspace state, but the toolbar still mutates the wrong state object — so changes silently land on the singleton compare state and never propagate.

## Fix direction

In combine mode, the toolbar must read from and write to the portfolio workspace's scenario list, not the singleton `assumptions`. Either:
- Render a combine-specific toolbar driven by `portfolioState` / `useCombineSimulation`, or
- Pass mode-aware getters/setters into `ScenarioToolbar` so it edits the active state object.

Make sure `custom` scenario edits land in `portfolioState.workspace.assumptions.returnScenarios` so `combineSelectedScenarioId` resolves correctly.

## Affected users

Anyone using "Mein Plan" who adjusts return scenarios or Monte Carlo settings.

## Notes

Same family as #22 ("eigenes Szenario only works in Vergleich"). #22 is the user-facing symptom; this issue is the underlying state-boundary leak.
