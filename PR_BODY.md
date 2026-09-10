## Summary

Mein Plan contracts can now set an optional expected return between −50% and 50% in their contract details. The value replaces the scenario market return in all three scenarios; clearing it restores the shared scenario value. Comparison keeps its shared return, and ETF allowance sharing preserves each contract's override. Contract details, sensitivity captions, print reports and both combine CSV sheets disclose the return assumption. The unused AVD `riskAnnualReturn` field is removed.

## Preflight

- Invariant preserved: CLAUDE.md's “Fair-comparison invariant (compare-mode only)”; singleton projections strip the override, and compare-mode oracle snapshots remain unchanged.
- User-visible surfaces affected: contract editing, Mein Plan sensitivity, contract decision tables, PDF assumptions and contract blocks, and both combine CSV sheets.
- Regression tests created or updated: `src/engine/portfolioProjection.test.ts`, `src/engine/portfolioAllowance.test.ts`, `src/features/inventory/contractDraft.test.ts`, `src/features/vertrag-detail/ContractEditor.test.tsx`, `src/features/mein-plan/sensitivitySelectors.test.ts`, `src/features/results/contractReturns.test.tsx`, and `src/utils/csvExport.test.ts`.

## Tests

- Added tests for absolute replacement across three scenarios, undefined pass-through, and compare projection isolation.
- Added two-ETF coverage for different expected returns surviving the shared Sparerpauschbetrag re-run.
- Added all-six-product validation, explicit zero, blank input, removal of a saved override, and preservation of a neighbouring contract.
- Added assertions for fixed-return sensitivity, rendered print and contract disclosures, and the actual return cells in both combine CSV sheets.
- Existing `etfContextParity.test.ts` passes unchanged. No oracle snapshots, frozen scenario inputs or scenario baselines were updated.
- `npm run scenario:report`: passed all 27 cases and 5,869 stages against the captured baseline.
- Final `npm run verify`: passed. App: 276 test files, 5,226 tests passed and 1 skipped. Workers: 26 QA tests and 11 Simulate API tests passed. Lint, Worker type checks, production TypeScript/Vite build and prerender passed.
- Regenerated `public/og/` images were discarded before committing.

## Review round 1

Round 1b: Clarified `/methode` that comparison deliberately shares each scenario's market return, while Mein Plan's “Erwartete Rendite” replaces it per contract in all three scenarios and is disclosed in contract details, print reports and CSV exports; updated the page copy test.

Existing ETF, bAV, private-insurance and Riester candidates now resolve the target's absolute `expectedReturn` through one shared helper. bAV and insurance offer activation use the same rule, and the recommender's P10 calculation uses the resolved candidate return. New bAV, AVD and Basisrente candidates retain the shared scenario rate.

Added tests first: deterministic projection and seeded P10 parity for all four existing-contract paths and both supported offer activations, a new-instance control, and the fixed-return ETF counterexample (age 37, retirement 67, 0% contract return, 0.2% fee, 7% shared scenario, €100/month top-up). Its recommendation delta matches the materialized what-if within the existing 3% ETF tolerance. The 13 affected checks failed before the fix; all 141 recommender tests now pass. Round 1 `npm run verify` passed; no oracle or baseline updates.

## Review round 2

Fixed the AVD guarantee CSV disclosure: `ProductResult.annualReturn` contains the modeled allocation blend, so it cannot disclose the contract's risky-market assumption. The combine export projection now resolves a dedicated `marketReturnAssumption` from `instance.expectedReturn ?? scenario.annualReturn`. Both CSV sheets use it under “Marktrendite p. a. (Annahme)”; the original `annualReturn` remains unchanged. The calculator passes the original workspace assumptions into the export path. Calls without source assumptions leave the disclosure blank.

Print reports and Vertrag-Detail continue to disclose the instance override and now explicitly show the selected scenario's market rate when the override is absent. Neither surface falls back to the AVD blend.

Tests first: the end-to-end `simulatePortfolio` → `buildCombineExportProjection` → `buildCombinePortfolioCsv` regression reproduced 6.00% instead of 7.00% for `guarantee_80` with a 7% override, 80% risky allocation and 2% low-risk return. Coverage also includes Standarddepot and ETF controls, two scenario rates, absent overrides and explicit zero; both CSV sheets and the projection are checked. Rendered AVD tests cover the override and scenario fallback in print and Vertrag-Detail. All 91 targeted checks pass. Full verification counts are recorded above; no oracle or baseline updates.

## Not done

None. Onboarding, InstanceCard, simulator logic, buildContext and engine Monte Carlo remain outside the change as directed; review round 1 changes only the recommender’s P10 return input.
