---
title: "RISK: Recommender confidence ignores private insurance instances"
Status: done
Severity: risk
Area: Group G / recommender / confidence signal
---

## Description

The confidence preface in `RecommenderCard` says it checks any baseline instance with model-estimate evidence, but the array omits `wsa.insurance` ([RecommenderCard.tsx:105](src/features/dashboard/RecommenderCard.tsx)). It includes bAV, ETF, Basisrente, AVD, and Riester only ([RecommenderCard.tsx:109](src/features/dashboard/RecommenderCard.tsx)).

## Impact

For Karin (or any user with a private pension/insurance contract imported from statement estimates), the recommendation card can sound more certain than the evidence quality supports — the confidence signal will not flag insurance-only estimate-driven inputs.

## Fix direction

Add `wsa.insurance` to the baseline-instance array in `RecommenderCard.tsx`. Verify by:
- Adding a test case where only an insurance instance has estimate evidence and the recommender confidence drops accordingly.
- Spot-checking that the symmetric case (insurance with user-supplied evidence) does not falsely lower confidence.

## Notes

Trivial code change; the value is the regression test that pins all six product families into the evidence-quality check.
