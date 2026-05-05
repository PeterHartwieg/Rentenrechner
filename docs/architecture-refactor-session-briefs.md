# Architecture Refactor Session Briefs

> **SUPERSEDED — see [`/CONTEXT.md`](../CONTEXT.md).**
>
> This document was a planning artifact for the architecture readability /
> simplification effort. Every session described below has shipped:
>
> - Sessions 1–2 (projections barrel removal, UI product registry) shipped before the
>   architecture-readability PRD.
> - Session 3 (`visibleProducts` filter) shipped — see `simulateRetirementComparison`.
> - Session 4 (salary-phase tax-delta primitives) shipped — see
>   `src/engine/salaryPhaseFunding.ts`.
> - Session 5 (monthly retirement net-payout primitive) shipped — see
>   `calculateMonthlyRetirementPayout` in `src/engine/retirementPayout.ts`.
> - Session 6 (`useSimulationViewModel` split) shipped — see
>   `src/app/useSimulationResult.ts`, `useWorkspaceUiState.ts`, `useDerivedViews.ts`.
>
> The follow-on architecture-readability work (combine-context, portfolio split,
> inventory registry, recommender candidates, recommendation rules/copy split,
> evidence/provenance alignment, storage section split) shipped under
> `.scratch/architecture-readability/` issues 01–13 and is mapped in
> [`/CONTEXT.md`](../CONTEXT.md).
>
> This file is preserved as historical context only. Do **not** treat its
> proposals as open work. New architecture changes start from `CONTEXT.md`.

---

This document breaks the architecture optimization review into independent work
packets that separate coding sessions can pick up. Each packet is scoped to keep
behavior stable unless explicitly called out. Prefer small PRs with focused tests
over one broad architecture PR.

## Recommended Order

1. Delete the obsolete `src/engine/projections.ts` compatibility barrel.
2. Add a UI product registry and collapse `InputsPanel` product dispatch.
3. Filter product simulation by `visibleProducts`, while keeping shared context eager.
4. Extract narrow funding tax-delta helpers.
5. Extract a monthly retirement net-payout primitive; keep lump sums separate.
6. Split `useSimulationViewModel` after the registry and selector shape is cleaner.

## Session 1: Delete `src/engine/projections.ts`

### Goal

Remove the obsolete pure barrel file and update docs that still advertise it.

### Rationale

`src/engine/projections.ts` only re-exports focused modules. Current tracked code
does not import it. Keeping it around suggests a module boundary that no longer
exists.

### Primary Files

- `src/engine/projections.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- Any test or doc hit found by a fresh search

### Proposed Steps

1. Search tracked files for `projections`, `./projections`, and `../projections`.
2. Delete `src/engine/projections.ts`.
3. Remove or update documentation rows that describe it as a compatibility barrel.
4. Run the normal verification command.

### Acceptance Checks

- No tracked source import references `src/engine/projections.ts`.
- Docs no longer instruct contributors to use or know about the barrel.
- `npm run verify` passes, or any failure is documented with exact command output.

### Guardrails

- Do not touch the focused modules (`accumulation`, `payoutMath`, `etfPayout`,
  `insurancePayout`, `bavPayout`) unless a real import break appears.

## Session 2: Product UI Registry

### Goal

Create a UI-side product registry keyed by `ProductId`, then use it to reduce the
hardcoded product branch chain in `InputsPanel`.

### Rationale

The engine already has `PRODUCT_REGISTRY` for metadata, simulators, and validators.
The UI still hardcodes product input rendering in `InputsPanel`. Group G
singleton-to-instance migration will need registry-driven rendering, and the
current branch chain is the main obstacle.

### Primary Files

- `src/features/inputs/InputsPanel.tsx`
- `src/features/inputs/*Inputs.tsx`
- `src/features/inputs/ProductTabs.tsx`
- `src/features/workspace/ProductFocusHeader.tsx`
- `src/app/productPresentation.ts`
- `src/engine/productRegistry.ts`
- `src/engine/productManifest.ts`

### Proposed Shape

Keep React-specific configuration out of `src/engine/productRegistry.ts`. Add a
UI module, for example:

```ts
// src/features/inputs/productUiRegistry.tsx
export const PRODUCT_UI_REGISTRY: Record<ProductId, ProductUiEntry> = {
  bav: {
    renderInputs: (props) => <BavInputs ... />,
    selectFunding: (simulation) => simulation.bavFunding,
    selectResult: (results) => results.find((r) => r.productId === 'bav'),
    feePresets: BAV_FEE_PRESETS,
  },
  // ...
}
```

`InputsPanel` should own the shared props once, then dispatch through the active
entry.

### Proposed Steps

1. Define the smallest useful `ProductUiEntry` type.
2. Move the product input dispatch table into a new UI module.
3. Replace the `activeTab === ...` chain with a single lookup and render call.
4. Keep product-specific components unchanged unless the new prop shape requires
   light adapter functions.
5. Move `GRV_COLOR` out of product presentation only if it has an obvious
   destination; otherwise leave it for a follow-up.

### Acceptance Checks

- Adding or removing a product input dispatch no longer requires editing a branch
  chain in `InputsPanel`.
- Engine modules do not import React or UI files.
- The rendered UI remains equivalent for all current products.
- Existing input tests and `npm run verify` pass.

### Guardrails

- Do not merge this with Group G state-shape changes.
- Do not put React components into `src/engine/productRegistry.ts`.
- Avoid redesigning the input UI while doing the routing refactor.

## Session 3: Filter Simulation By Visible Products

### Goal

Stop simulating every registered product when `assumptions.visibleProducts`
contains only a subset. Keep the existing eager shared context for now.

### Rationale

`simulateRetirementComparison` currently builds context once, then simulates every
product for every return scenario. The UI filters later. Monte Carlo already
filters the registry before simulating, so the main deterministic path should
match that behavior.

### Primary Files

- `src/engine/simulate.ts`
- `src/engine/simulationContext.ts`
- `src/engine/monteCarlo.ts`
- `src/domain/results.ts`
- `src/engine/simulate.integration.test.ts`
- Product tests that assume all products are present

### Proposed Steps

1. In `simulateRetirementComparison`, derive `productsToSimulate` from
   `assumptions.visibleProducts`.
2. Preserve current empty-array semantics. Check `ScenarioAssumptions` docs and
   current UI assumptions before deciding whether empty means "none" or fallback.
3. Keep `buildContext` unchanged in this session.
4. Update tests that currently assume all products are returned regardless of
   visibility.
5. Confirm UI consumers already handle missing products.

### Acceptance Checks

- Deterministic simulation returns only visible products for each scenario.
- Empty comparison behavior matches the intended UI empty state.
- Monte Carlo and deterministic simulation use compatible filtering semantics.
- `npm run verify` passes.

### Guardrails

- Do not skip `bavFunding` in `buildContext` yet. ETF and private insurance use
  `ctx.bavFunding.monthlyNetCost` as the synchronized monthly investment anchor.
- Do not move per-product funding into registry callbacks in this session.

## Session 4: Narrow Funding Tax-Delta Helpers

### Goal

Extract the repeated salary-phase tax-delta calculation used by Basisrente, AVD,
and Riester, without forcing their product-specific result types into one generic
funding result.

### Rationale

Basisrente, AVD, and Riester all do:

```ts
taxWithout = tax(zvE)
taxWith = tax(max(0, zvE - deductible))
taxSaving = max(0, taxWithout - taxWith)
```

bAV is different: salary conversion changes salary, social insurance, employer
subsidy, net pay, and pensionable earnings. It should not be folded into the same
funding abstraction.

### Primary Files

- `src/engine/basisrente.ts`
- `src/engine/altersvorsorgedepot.ts`
- `src/engine/riester.ts`
- `src/engine/salary.ts`
- `src/engine/tax.ts`
- `src/engine/products/*test.ts`
- `src/app/syncContributions.ts`

### Proposed Shape

Add a small helper, for example:

```ts
export function calculateSalaryPhaseTaxDelta(
  rules: GermanRules,
  taxableIncome: number,
  deductionAnnual: number,
): {
  taxableIncomeWithout: number
  taxableIncomeWith: number
  taxWithout: number
  taxWith: number
  taxSavingAnnual: number
}
```

Optionally add:

```ts
export function calculateAllowanceExcessBenefit(
  taxSavingAnnual: number,
  allowanceAnnual: number,
): number
```

### Proposed Steps

1. Add the helper in a focused engine module, such as `salaryPhaseFunding.ts`.
2. Replace inline tax-delta code in Basisrente, AVD, and Riester.
3. Keep each public `calculate*Funding` return shape unchanged.
4. Add focused tests for the helper.
5. Keep existing product funding tests, but remove only duplicated assertions
   where the new helper test fully covers them.

### Acceptance Checks

- No behavior changes in golden funding outputs.
- Basisrente, AVD, and Riester no longer duplicate tax-delta code.
- bAV funding remains in `salary.ts` and keeps its existing tests.
- Inverse solvers still pass their tests.

### Guardrails

- Do not create one generic `FundingResult` union in this session.
- Do not alter allowance, cap, or minimum contribution logic.
- Do not refactor bAV salary conversion beyond optional use of a very small tax
  primitive if it naturally fits.

## Session 5: Monthly Retirement Net-Payout Primitive

### Goal

Extract a shared monthly-payout cascade for marginal retirement tax plus monthly
KV/PV. Keep lump-sum calculations separate.

### Rationale

Monthly payout helpers repeat a common pattern:

1. Build a retirement income base.
2. Calculate marginal retirement tax for the channel delta.
3. Calculate KV/PV based on retirement health status and channel classification.
4. Return net monthly payout.

This applies across bAV, private insurance monthly payout, certified pension
payout, and Basisrente. Lump sums differ enough to remain separate paths.

### Primary Files

- `src/engine/retirementPayout.ts`
- `src/engine/bavPayout.ts`
- `src/engine/insurancePayout.ts`
- `src/engine/certifiedPensionPayout.ts`
- `src/engine/basisrente.ts`
- `src/engine/retirementKvPv.test.ts`
- `src/engine/products/*payout*.test.ts`

### Proposed Shape

Extend `retirementPayout.ts` with a monthly helper that accepts:

- base income inputs: `retirementYear`, `grvBaselineMonthly`, `otherMonthlyIncome`
- tax delta channel: statutory pension, bAV pension, private insurance taxable
  annual, or other taxable annual
- KV/PV channel: bAV Versorgungsbezug, freiwillig-other income, or none
- health status: `kvdr`, `freiwillig_gkv`, or `pkv`

Return a breakdown, not just a number:

```ts
{
  netMonthly: number
  marginalTaxAnnual: number
  kvPvMonthly: number
}
```

Thin public wrappers can keep returning `number` for compatibility.

### Proposed Steps

1. Add the monthly primitive and tests in `retirementPayout.ts`.
2. Migrate `netCertifiedPensionPayout` first, since it is already a shared
   wrapper for AVD and Riester.
3. Migrate `netBasisrentePayout`.
4. Migrate `netBavPayout`.
5. Migrate `netInsurancePayout` only after pre-2005 and Ertragsanteil behavior is
   covered by tests.

### Acceptance Checks

- Existing public function signatures remain compatible.
- Monthly payout tests pass unchanged or with only expected breakdown additions.
- The certified pension freiwillig-GKV BBG headroom behavior is explicitly tested.
- Lump-sum helpers remain separate.

### Guardrails

- Do not fold `afterTaxBavLumpSum`, `insuranceLumpSumBreakdown`, or certified
  partial capital helpers into the monthly primitive.
- Be careful with `otherMonthlyIncome` headroom. Basisrente currently includes
  `otherMonthlyIncome + grvBaselineMonthly` in freiwillig-GKV headroom; certified
  pension currently only passes `grvBaselineMonthly`. Decide whether that is a
  bug fix and document/test it.
- Do not make a broad enum pipeline until the smaller helper has proven useful.

## Session 6: Split `useSimulationViewModel`

### Goal

Separate simulation, UI state, and derived view data from the wide
`useSimulationViewModel` hook.

### Rationale

The current hook mixes:

- simulation and tax-mode derivation
- workspace UI toggles
- chart/table/export derivation
- share-link side effects

The return object is almost as wide as the implementation. Splitting it will make
Group G per-instance derived views easier, but it should happen after product UI
dispatch and simulation filtering are cleaner.

### Primary Files

- `src/app/useSimulationViewModel.ts`
- `src/App.tsx`
- `src/features/results/*`
- `src/features/cashflows/CashflowTable.tsx`
- `src/utils/csvExport.ts`
- `src/utils/urlShare.ts`

### Proposed Shape

Start with pure selectors before splitting hooks:

```ts
deriveSelectedResults(simulation, visibleProducts, scenarioId)
buildCapitalChartData(selectedResults, showRealValues)
buildPensionBars(simulation, selectedResults)
deriveCashflowAfterTaxBalance(input)
```

Then split hooks:

- `useSimulationResult(profile, assumptions)`
- `useWorkspaceUiState(assumptions)`
- `useDerivedViews(simulation, ui, profile, assumptions)`

### Proposed Steps

1. Extract pure functions from `useSimulationViewModel` and test them with small
   fixtures.
2. Keep the original hook as a facade that calls the extracted functions.
3. Move UI toggles into `useWorkspaceUiState`.
4. Move simulation and tax-mode derivation into `useSimulationResult`.
5. Move chart/table/export derivation into `useDerivedViews`.
6. Update `App.tsx` once the facade is proven stable.

### Acceptance Checks

- `App.tsx` no longer destructures one 25-plus-value object.
- Pure selectors are unit-testable without React.
- Share URL and CSV export behavior remains unchanged.
- No simulation rerun is introduced by moving UI-only state.

### Guardrails

- Do not start this before Session 2 unless there is a pressing bug.
- Do not combine this with visual redesign.
- Do not change CSV columns or share URL schema unless covered by explicit tests.

## Cross-Session Notes

- Keep `src/engine/productRegistry.ts` engine-only. UI registries can depend on
  engine metadata, but engine code should not depend on React.
- Preserve public function signatures where external tests or many call sites use
  them. Prefer thin wrappers over flag-day rewrites.
- Run `npm run verify` after each session. If it is too slow during exploration,
  run targeted Vitest files plus `npx tsc --noEmit`, then run full verify before
  closing the session.
- Watch for existing worktree changes. Do not revert unrelated edits.
- If a session discovers a behavior inconsistency, write a targeted regression
  test before normalizing the code path.

