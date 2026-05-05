---
title: Cannot add new Verträge after onboarding flow is complete
Status: done
Area: Group G / combine mode / inventory
---

## Description

Once the onboarding / inventory wizard is finished and the user lands in "Mein Plan" (combine mode), there is no visible affordance to add a further contract (Vertrag) to the workspace. Users who later sign a new bAV / Riester / private insurance contract — or who simply forgot one during onboarding — have no path to extend their inventory short of restarting onboarding from scratch.

## Steps to reproduce

1. Complete the inventory wizard with one or more contracts.
2. Land in "Mein Plan".
3. Look for a button / menu to add another Vertrag — none is visible.

## Expected

From the "Mein Plan" dashboard the user can add a new contract of any supported product type at any time. Ideally:
- A clearly labelled "Vertrag hinzufügen" action on the dashboard.
- Opens an inline form (or single-step mini-wizard) that creates a new instance in `portfolioState`.
- Honors the singleton-to-instance schema (multiple instances of the same product type allowed).

## Notes

`usePortfolioState` already supports adding instances programmatically — this is a UI gap, not an engine gap. Likely place to wire a button: dashboard area in `src/App.tsx` combine-mode branch, plus a handler in `src/app/portfolioState.ts`. Re-using the wizard step components from `src/features/inventory/` for the inline form would keep input UX consistent.
