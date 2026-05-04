---
title: "Add Gesamtportfolio lifecycle chart to Mein Plan"
Status: ready-for-agent
Severity: P1
Type: AFK
Area: Mein Plan / charts / portfolio lifecycle
---

## What to build

Reuse the existing Vergleich lifecycle/break-even chart concept for `Mein Plan`. The chart should sit directly below the Rentenluecke dashboard and default to `Gesamtportfolio`.

It visualizes the user's additional Vorsorgeprodukte, excluding GRV.

## Acceptance criteria

- [ ] `Mein Plan` renders a lifecycle chart directly below the Rentenluecke dashboard.
- [ ] Default selected chip/view is `Gesamtportfolio`.
- [ ] Product-type chips allow drilldown by product type, not individual contract.
- [ ] If multiple contracts of the same product type exist, the product chip label includes the count, e.g. `bAV (2 Vertraege)`.
- [ ] Aggregated product-type lines sum Netto eingezahlt, Restkapital / modeled contract value, and Netto ausgezahlt across instances.
- [ ] Gesamtportfolio line sums active and paid-up non-GRV product instances.
- [ ] GRV is excluded from this chart and remains represented in the Rentenluecke/income stack.
- [ ] Offered/draft/surrendered instances are excluded from the baseline lifecycle chart.
- [ ] Chart keeps the existing concepts: Netto eingezahlt, Restkapital / modeled contract value, Netto ausgezahlt, break-even.
- [ ] Tooltips make clear that annuity-product `Restkapital` after retirement is a modeled contract value, not a freely accessible account balance.
- [ ] Vergleich view keeps its current product-alternative lifecycle chart and does not gain a Gesamtportfolio aggregate.
- [ ] Tests cover aggregation, GRV exclusion, status filtering, and multiple same-product instances.

## Implementation notes

Decision source: `.scratch/group-g-qa/decisions.md`.

Existing chart implementation:

- `src/features/results/BreakEvenChart.tsx`
- `src/features/results/breakEvenSeries.ts`
- `src/features/results/lifecycleHorizon.ts`

Likely create a portfolio adapter/series helper rather than forcing `ProductId` keys into a multi-instance aggregate shape.

## Blocked by

None - can start immediately.
