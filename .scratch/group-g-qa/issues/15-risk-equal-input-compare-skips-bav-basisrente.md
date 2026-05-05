---
title: "RISK: Equal-input compare mode does not enforce equal contributions for bAV, Basisrente, AVD, Riester"
Status: ready-for-human
Severity: risk
Area: engine / equalInputComparator
---

## Description

`equalInputComparator.ts` explicitly does **not** force bAV, Basisrente, AVD, and Riester to the equal contribution amount ([equalInputComparator.ts:18](src/engine/equalInputComparator.ts), [equalInputComparator.ts:30](src/engine/equalInputComparator.ts), [equalInputComparator.ts:74](src/engine/equalInputComparator.ts)). ETF and pAV are equalized; the others use their own inputs.

This is architecturally defensible (bAV funding is constrained by statutory limits; Basisrente/AVD/Riester have their own contribution logic), but creates a **copy risk**: if any broker-facing or user-facing copy says "all selected products at the same contribution", the claim is false.

## Required action

1. **Audit all user-facing copy** that describes the equal-input comparison mode. Any phrasing like "gleicher Beitrag" must either be scoped to ETF + pAV only, or the engine must be extended to cover the remaining products.
2. **Add a tooltip or annotation** in the UI next to the equal-input toggle that explicitly names which products are equalized.
3. Decide whether extending equalization to bAV (net cost equalization) is in scope. If yes, track separately.
