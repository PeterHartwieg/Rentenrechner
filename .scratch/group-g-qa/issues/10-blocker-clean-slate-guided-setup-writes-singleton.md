---
title: "BLOCKER: Clean-slate combine onboarding writes to singleton state, not combine baseline"
Status: done
Severity: blocker
Area: Group G / GuidedSetup / combine mode
---

## Description

The combine-new CTA sets combine mode and opens `GuidedSetup` ([App.tsx:159](src/App.tsx)). But `GuidedSetup.onApply` only calls `setProfile` / `setAssumptions` from `useCalculatorState` ([App.tsx:546](src/App.tsx), [App.tsx:549](src/App.tsx)).

`simulatePortfolio` reads `portfolioState.workspace`, so Anna's guided inputs never reach the combine dashboard. The guided setup data is silently discarded into the singleton compare state which the combine view doesn't read.

## Expected

`GuidedSetup.onApply` (or the combine-new CTA wrapper) translates the guided profile into a `portfolioState` workspace baseline so that `simulatePortfolio` picks it up.

## Fix direction

Either:
- Have the combine-new `onApply` handler write to `portfolioState` (e.g. update the global assumptions portion of the workspace), or
- Introduce a separate `onApplyForCombine` path in `GuidedSetup` that calls the portfolio state setter.

## Affected users

Anna persona — any user starting a fresh "Mein Plan" from scratch.
