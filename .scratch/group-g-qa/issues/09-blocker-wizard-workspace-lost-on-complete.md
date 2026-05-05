---
title: "BLOCKER: Inventory wizard workspace lost when onComplete fires"
Status: done
Severity: blocker
Area: Group G / InventoryWizard / App
---

## Description

`InventoryWizard` correctly builds and saves a new workspace, then passes it to `onComplete` ([InventoryWizard.tsx:438](src/features/inventory/InventoryWizard.tsx), [InventoryWizard.tsx:449](src/features/inventory/InventoryWizard.tsx)). However, `App.tsx` ignores the workspace argument and only flips `mode`/`view` ([App.tsx:198](src/App.tsx), [App.tsx:204](src/App.tsx)).

Because `usePortfolioState` keeps its own in-memory workspace and re-saves on change ([portfolioState.ts:210](src/app/portfolioState.ts), [portfolioState.ts:213](src/app/portfolioState.ts)), the `setMode('combine')` call overwrites the freshly saved wizard workspace with the stale default.

This breaks the **Bernd / Karin / Dilan "existing contracts"** launch path — users lose everything they entered in the wizard.

## Steps to reproduce

1. Use the existing-portfolio onboarding flow to enter one or more contracts.
2. Complete the wizard.
3. Observe that the combine dashboard shows the default/empty workspace, not the entered contracts.

## Fix direction

`App.tsx`'s `onComplete` handler must consume the workspace returned by the wizard and pass it to `usePortfolioState` before (or instead of) calling `setMode('combine')`. The save in `portfolioState` must happen with the new workspace, not the stale one.

## Affected users

Bernd, Karin, Dilan personas — anyone entering the app via the "existing contracts" path.
