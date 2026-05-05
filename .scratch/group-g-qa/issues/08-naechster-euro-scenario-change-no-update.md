---
title: Scenario change does not update values in "Was passiert mit deinem nächsten Euro?" panel
Status: done
Area: Group G / marginal-analysis panel
---

## Description

In the "Was passiert mit deinem nächsten Euro?" (marginal next-euro) panel, switching the return scenario (e.g. pessimistic → base → optimistic) has no visible effect on the displayed values. The panel continues to show stale figures from the previously selected scenario.

## Steps to reproduce

1. Open the "nächsten Euro" panel with a scenario active.
2. Switch to a different return scenario using the scenario picker.
3. Observe that the marginal values in the panel do not change.

## Expected

Changing the scenario re-runs the marginal analysis with the new return assumptions and updates all figures in the panel.

## Notes

Check whether the panel subscribes to the selected scenario from `useSimulationResult` / `simulationSelectors.ts`, or whether it derives its own scenario independently. A likely cause is that the panel reads from a stale memo that is not invalidated when `assumptions.returnScenarios` selection changes. See `src/app/useSimulationResult.ts` and `src/app/simulationSelectors.ts`.
