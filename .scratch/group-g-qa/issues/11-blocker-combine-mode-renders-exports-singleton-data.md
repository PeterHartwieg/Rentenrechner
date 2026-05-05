---
title: "BLOCKER: Combine mode renders and exports singleton compare data"
Status: done
Severity: blocker
Area: Group G / combine mode / exports
---

## Description

The combine view adds `RecommenderCard` / `CombineIncomePanel` ([App.tsx:247](src/App.tsx)) but then continues rendering `ComparisonPicker`, `DecisionSummary`, charts, and metrics sourced from singleton `assumptions` / simulation ([App.tsx:278](src/App.tsx), [App.tsx:295](src/App.tsx)).

Exports are also wrong:
- `PrintReport` is always fed singleton data ([App.tsx:541](src/App.tsx)).
- CSV export uses singleton `visibleProducts` ([useDerivedViews.ts:118](src/app/useDerivedViews.ts)).

For "Mein Plan" users, exports are stale or entirely irrelevant to the contracts they actually entered.

## Expected

In combine mode all rendered charts, metrics, and exports should be driven by `portfolioState` / `simulatePortfolio` output, not by singleton compare state.

## Fix direction

Gate the singleton compare sections behind `mode !== 'combine'`. Provide combine-specific chart/metrics components (or adapt existing ones to accept `PortfolioResult`). Pass `portfolioResult` to `PrintReport` and the CSV builder when in combine mode.

## Affected users

Any user in combine / "Mein Plan" mode who prints or exports.
