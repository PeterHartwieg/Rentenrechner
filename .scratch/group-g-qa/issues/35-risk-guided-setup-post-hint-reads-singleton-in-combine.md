---
title: "RISK: Guided-setup post hint reads singleton simulation in combine mode"
Status: done
Severity: risk
Area: Group G / guided setup / combine mode
---

## Description

The guided-setup post hint can render in the combine view but derives its factors from singleton `selectedResults` and singleton `simulation.bavFunding` ([App.tsx:307](src/App.tsx)).

## Impact

First-time Lena after guided setup, especially if she enters combine mode, can see a hint that does not correspond to the portfolio instances she just built. Lower severity than the toolbar / export issues (#25, #26, #27) but it is the same state-boundary leak — guidance copy that asserts numbers based on the wrong simulation source.

## Fix direction

In combine mode, either:
- Source the hint's factors from `useCombineSimulation` / `simulatePortfolio` output (the right values for what the user actually has), or
- Hide the post hint in combine mode if the source data isn't available there yet.

Pick whichever is smaller; the engine fix is preferred since the hint is supposed to be useful precisely after the user has built their portfolio.

## Notes

Same family as #25 / #26 / #27 — combine-mode surfaces still occasionally consume singleton state. Sweep when the toolbar / share-link / print-report fixes land and check for any other singleton reads in the combine branch of `App.tsx`.
