---
title: "RISK: Portfolio adapter equivalence only tested for length-1 bAV workspace"
Status: done
Severity: risk
Area: engine / portfolioAdapter / tests
---

## Description

The claim that "byte-identical results for length-1 workspaces" holds is thinner than it sounds. The adapter's explicit length-1 equivalence test covers **bAV only** and uses a permissive `toBeCloseTo` at cents precision ([portfolioAdapter.test.ts:1087](src/engine/portfolioAdapter.test.ts), [portfolioAdapter.test.ts:1118](src/engine/portfolioAdapter.test.ts)).

ETF, pAV, Basisrente, AVD, and Riester products have no equivalence coverage. Future adapter edits could silently drift from the singleton engine for any of these product types without breaking existing tests.

## Fix direction

Add explicit length-1 equivalence goldens for at least:
- ETF Sparplan
- Private insurance (pAV)
- One certified pension product (AVD or Riester)

Consider tightening the tolerance from `toBeCloseTo` to exact equality (or a documented acceptable delta) so regressions surface loudly. Reference the pattern in `simulate.integration.test.ts` for how singleton goldens are structured.
