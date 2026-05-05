---
title: ETF Sparplan modelled as Vertrag in onboarding — wrong concept and irrelevant Vertragsbeginn
Status: done
Area: Group G / onboarding
---

## Description

The onboarding menu currently treats an ETF Sparplan the same way as an insurance contract, showing a "Vertragsbeginn" field and using "Vertrag" terminology. An ETF Sparplan is not a Vertrag in the legal or product sense, and a contract start date is not a meaningful concept for a depot savings plan.

## Problems

1. **Wrong label / concept** — "Vertrag" copy should not apply to ETF Sparplan entries.
2. **Spurious Vertragsbeginn field** — the field has no effect on the ETF simulation (ETF has no acquisition-cost amortisation or tax-mode derivation tied to contract year). Showing it confuses users.

## Expected

- ETF Sparplan entries use depot/investment-plan terminology in the onboarding copy.
- Vertragsbeginn is either hidden or replaced with a more meaningful field (e.g. "Seit wann besparst du diesen ETF?") if the start date is actually needed.

## Notes

Cross-check `src/content/triggers.ts` (PATH_OPTIONS, VISIBLE_PRODUCTS_BY_PATH) and the onboarding component to understand where the Vertrag/Vertragsbeginn fields are rendered per product.
