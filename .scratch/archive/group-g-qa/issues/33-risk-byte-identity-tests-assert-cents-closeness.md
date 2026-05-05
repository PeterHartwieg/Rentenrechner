---
title: "RISK: Adapter \"byte identity\" tests actually assert cents-level closeness"
Status: done
Severity: risk
Area: Group G / portfolioAdapter / equivalence tests
---

## Description

The newer length-1 equivalence tests describe results as "byte-identical" but assert `toBeCloseTo(..., 2)` for ETF, pAV, and AVD ([portfolioAdapter.test.ts:1974](src/engine/portfolioAdapter.test.ts), [portfolioAdapter.test.ts:2029](src/engine/portfolioAdapter.test.ts), [portfolioAdapter.test.ts:2087](src/engine/portfolioAdapter.test.ts)). Basisrente and Riester are not covered in that #18 block.

## Impact

Future adapter refactors. The legacy compare-mode integration snapshots are strong, but the new singleton-to-instance equivalence layer does not prove exact identity despite saying it does. If the publication claim is literally "byte-identical length-1 workspaces," the tests don't back it.

## Fix direction

Either:
1. Tighten the assertions: replace `toBeCloseTo(..., 2)` with exact `toEqual` / `toBe` / snapshot assertions, and extend coverage to Basisrente + Riester. This is the strong move — proves the invariant the test claims.
2. Soften the prose: say "matches the singleton path within rounding tolerance" instead of "byte-identical." This is the small move — accurate but weaker.

Option 1 is preferred since adapter equivalence is the safety net for the singleton-to-instance migration.

## Notes

Follow-on of #18. The structure was right; the assertions need to match the claim.
