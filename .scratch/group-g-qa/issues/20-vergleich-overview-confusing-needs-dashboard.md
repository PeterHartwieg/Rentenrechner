---
title: "Vergleich overview is sparse and confusing — turn into a dashboard with Rentenlücke + savings CTA"
Status: done
Area: Group G / Vergleich view / dashboard
---

## Description

The Vergleich view's top-level overview is currently very limited and not informative for a first-time visitor — it does not communicate at a glance how the user is tracking against their retirement goal, nor does it offer a clear next action. New users land on it and don't know what they are looking at or what to do next.

## Expected

Reframe Vergleich's overview as a **dashboard** that:

- Visualizes the **Rentenlücke** (gap between projected total retirement income and a target / desired income) — e.g. a horizontal bar or stacked-area showing GRV + each product contribution vs. the target.
- Shows the headline numbers in plain language: projected monthly net retirement income, target, gap.
- Surfaces a primary CTA button — working label "Mehr sparen" / "Lücke schließen" / similar — that takes the user to a contribution-adjustment flow or to add an additional product.
- Keeps the comparison detail (per-product results, charts, tables) reachable but no longer the only thing on screen.

## Notes

- Final button label and copy TBD; suggestion above is a working name.
- Rentenlücke target needs a UX for setting the desired retirement income (could default off `assumptions.salary.gross` × replacement ratio if not user-set).
- Reuse `simulatePortfolio` / `simulationSelectors.ts` outputs; do not introduce a parallel calculation path.
- Naming reminder: avoid baking "Rentenrechner" into the new dashboard copy — the public name is TBD (see CLAUDE.md "Working name only").
