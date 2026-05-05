---
title: "BLOCKER: Combine print report still consumes singleton profile, GRV, and scenario ordering"
Status: done
Severity: blocker
Area: Group G / combine mode / print + export / compliance
---

## Description

`App.tsx` passes singleton `profile`, singleton `assumptions`, and singleton `simulation` into `PrintReport` even in combine mode ([App.tsx:616](src/App.tsx)). `CombinePrintReport` then derives GRV from `simulation.statutoryPension` and scenario order from singleton `assumptions.returnScenarios` ([PrintReport.tsx:309](src/features/results/PrintReport.tsx)).

The correct combine GRV is calculated separately from workspace baseline data ([useCombineSimulation.ts:74](src/app/useCombineSimulation.ts)) and is not consulted by the print path.

## Impact

After an inventory wizard or loaded v2 workspace diverges from the singleton compare state, the PDF can print **the wrong personal baseline and GRV next to otherwise portfolio-shaped rows**.

This is publication-blocking because exports are legal/compliance surfaces, not just UI convenience — the disclaimer pins them as illustrations the user can hand to a third party (broker, partner). A PDF that mixes singleton personal data with portfolio rows is a compliance hazard, not just a UX bug.

## Fix direction

In combine mode, feed `PrintReport` the workspace baseline profile, the combine GRV from `useCombineSimulation`, and the workspace scenario list. `CombinePrintReport` must source all combine-mode personal/GRV/scenario data from the workspace, never from singleton `assumptions` / `simulation`.

Keep the disclaimer-first invariant intact (literal first child of `#print-report` — see CLAUDE.md "Critical guardrails" #1).

## Affected users

Any combine-mode user who prints or exports PDF — especially anyone whose inventory diverges from the (default) singleton state.

## Notes

Follow-on of #11 (which stopped exports from being entirely singleton-driven) and overlaps with #24 (details/export tabs empty in Mein Plan). This issue is specifically about the personal / GRV / scenario fields the combine print path silently keeps reading from singleton state.
