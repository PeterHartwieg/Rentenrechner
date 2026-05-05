---
title: "BLOCKER: Combine details tab is a compare-mode shell with an empty product table"
Status: done
Severity: blocker
Area: Group G / combine mode / details view
---

## Description

In combine mode, the details tab renders `DetailComparisonTable products={[]}` ([App.tsx:406](src/App.tsx)). The component itself remains a singleton product-comparison table titled "Detailvergleich" with product / scenario / capital / factor columns ([DetailComparisonTable.tsx:34](src/features/results/DetailComparisonTable.tsx)).

## Impact

The portfolio redesign exposes a "details" route, but the on-screen detail table is **empty by construction**. CSV and print are now partly portfolio-aware, but the visible detail view is not a real combine-mode view — it is a compare-mode shell with no rows.

## Fix direction

Render a combine-mode detail view sourced from `simulatePortfolio` output:
- One row / block per **instance** in the workspace (not per product type), since the same product type can have multiple instances in v2.
- Per-instance breakdown: accumulation, payout schedule, fee drag, tax/KV-PV cascade.
- Reuse provenance primitives from `src/features/results/provenance.tsx` to surface user vs. estimated values.

`DetailComparisonTable` is the wrong component for this; either build a sibling `CombineDetailView` or refactor the table to accept a `PortfolioResult`. Keep "Link kopieren" gated by #26's resolution.

## Affected users

Any combine-mode user clicking the Details tab.

## Notes

Companion to #24 (details/export tabs almost empty in Mein Plan). #24 is the user-reported symptom across both tabs; this issue pinpoints the empty-by-construction wiring of the details tab specifically.
