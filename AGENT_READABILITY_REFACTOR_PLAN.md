# Agent-Readability Refactor Plan

> **SUPERSEDED — see [`CONTEXT.md`](CONTEXT.md) and [`docs/architecture-refactor-session-briefs.md`](docs/architecture-refactor-session-briefs.md).**
>
> This plan was the 2026-04-28 baseline for the architecture readability /
> simplification effort. The work it scoped (App.tsx split, product-local
> capsules, narrower domain barrels, discriminated result types, app-layer
> hook splits, combine-mode submodule extraction) all shipped under
> `.scratch/architecture-readability/` issues 01–13. The current ownership
> map lives in `CONTEXT.md`.
>
> Preserved as historical context only. Do **not** treat its proposals as
> open work. New architecture changes start from `CONTEXT.md`.

This plan improves the project for AI coding agents and human maintainers by reducing context size, making ownership boundaries explicit, and letting TypeScript guide product-specific changes more precisely.

Current baseline observed on 2026-04-28:

- Small repo by file count, but high domain density.
- 383 tests pass with `npm test`.
- `npm run lint` and `npm run build` currently fail because of active worktree issues:
  - unused `calculateRiesterFunding` import in `src/engine/riester.test.ts`
  - unused `validateAvdPayoutAge` import in `src/engine/simulate.ts`
  - missing `riesterTransferCapital` field on `defaultAvdAssumptions`
- Primary context-heavy files by line count:
  - `src/App.tsx` -- 3,088 lines (dominant problem)
  - `src/engine/simulate.test.ts` -- 1,782 lines
  - `src/domain/types.ts` -- 872 lines
  - `src/engine/simulate.ts` -- 694 lines (manageable; less urgent than the above)

## Goals

1. Reduce the amount of code an agent must read before making a safe change.
2. Give each pension/investment product a clear local home.
3. Make product-specific assumptions, validation, simulation, UI, and tests discoverable from one place.
4. Replace broad optional result fields with discriminated types where possible.
5. Preserve current behavior while improving structure.
6. Keep every phase verifiable with tests, lint, and build.

## Non-Goals

- Do not change financial/legal behavior as part of pure refactors unless a failing test reveals an existing bug.
- Do not rewrite the UI visually during component extraction.
- Do not introduce a backend, database, or runtime state manager.
- Do not add a knowledge-graph tool as a required dependency.

## Token-Budget Design Rules

These rules are specifically for reducing context size for future AI coding agents.

1. Prefer small public surfaces over convenient mega-barrels. `src/domain/index.ts` is useful, but product modules should also expose narrow product-specific imports so agents do not need to load every domain type.
2. Keep each product's "change capsule" local: assumptions type, validator, simulator, metadata, tests, and short product notes should live close together.
3. Use short index docs instead of repeating legal/product rationale in many files. Long research remains in existing research docs; implementation files should link to the specific section rather than restating whole arguments.
4. Add generated or easily refreshed inventory commands where possible, so agents can inspect file size, exports, and test hotspots without reading entire files.
5. Avoid broad wildcard re-exports from feature folders. They make dependency tracing harder and encourage agents to open too much.
6. Keep `AGENTS.md` as a routing map, not a second design document. It should tell agents what to read first and what to avoid reading unless needed.

## Phase ordering rationale

Two constraints drive the order:

1. Test factories (Phase 5) must exist before engine surgery (Phase 6). Phase 6 is the highest-risk phase -- golden fixtures and a minimal integration baseline must be in place first.

2. Product simulators (Phase 6) must be extracted before type splits (Phase 7) and discriminated unions (Phase 8). Phase 6 defines the product module boundaries; Phases 7-8 split types along those same lines. Reversing this order means splitting types before knowing what shape the simulators need, then redoing the splits.

The agent navigation map (AGENTS.md) is deferred to the final phase. Writing it early produces a map of the old topology that must be rewritten after the refactor.

## Phase 0: Restore Verification Baseline

Purpose: make sure later refactors start from a clean, trusted baseline.

Tasks:

1. Fix the current TypeScript/lint failures.
2. Add a single verification command to `package.json`:

   ```json
   "verify": "npm run lint && npm test && npm run build"
   ```

3. Add a lightweight repo inventory command for agents:

   ```json
   "repo:stats": "node scripts/repo-stats.mjs"
   ```

   The script should print:
   - largest source files by line count
   - largest test files by line count
   - exported symbols per file
   - total tracked source/test/doc lines

4. Run `npm run verify`.

Acceptance criteria:

- `npm run lint` passes.
- `npm test` passes.
- `npm run build` passes.
- `npm run repo:stats` prints a concise inventory in under 100 lines.
- No behavior changes beyond fixing the active compile/lint issues.

## Phase 1: Extract Shared UI Primitives

Purpose: remove reusable controls from `App.tsx` before larger feature extraction.

Suggested target files:

```
src/ui/NumberField.tsx
src/ui/ResultMetric.tsx
src/ui/BavWaterfall.tsx
src/ui/formatting.ts
```

Tasks:

1. Move `NumberField` out of `App.tsx`.
2. Move `ResultMetric` out of `App.tsx`.
3. Move `BavWaterfall` out of `App.tsx`.
4. Move generic helper functions like `clampNumber`, `updateNumber`, and `bestResult` into appropriate utility modules.

Acceptance criteria:

- `App.tsx` no longer defines generic UI controls.
- Public props are typed explicitly.
- Visual output is unchanged.
- `npm run verify` passes.

## Phase 2: Extract App State And View Model

Purpose: separate state orchestration and derived display data from JSX.

Suggested target files:

```
src/app/useCalculatorState.ts
src/app/useSimulationViewModel.ts
src/app/productPresentation.ts
```

Tasks:

1. Move localStorage/URL initialization and persistence into `useCalculatorState`.
2. Move selected scenario, selected results, chart data, pension bars, best-result selection, and cashflow helpers into `useSimulationViewModel`.
3. Move product colors, product order, and labels into `productPresentation.ts` as a temporary home; they will be superseded by the product manifest in Phase 9.
4. Keep view-model outputs deliberately small and display-oriented. Do not return raw `SimulationResult` plus many helper closures when a component only needs chart rows, table rows, or metric cards.

Acceptance criteria:

- `App.tsx` mainly composes layout and feature sections.
- Derived data is testable without rendering React.
- Product display metadata is no longer embedded in the app root.
- Chart/table components can be understood from their prop types without loading simulation internals.
- `npm run verify` passes.

## Phase 3: Split Input And Result Features (JSX only)

Purpose: reduce `App.tsx` from a full application implementation to a composition shell. CSS is not moved in this phase -- that is deferred to Phase 4 to keep visual regressions isolated.

Suggested target folders:

```
src/features/inputs/
src/features/results/
src/features/cashflows/
src/features/assumptions/
```

Suggested components:

```
src/features/inputs/ProfileInputs.tsx
src/features/inputs/ScenarioPresetPanel.tsx
src/features/inputs/ReturnScenarioEditor.tsx
src/features/inputs/BavInputs.tsx
src/features/inputs/InsuranceInputs.tsx
src/features/inputs/BasisrenteInputs.tsx
src/features/inputs/AltersvorsorgedepotInputs.tsx
src/features/inputs/RiesterInputs.tsx
src/features/results/SummaryMetrics.tsx
src/features/results/CapitalChart.tsx
src/features/results/PensionChart.tsx
src/features/results/FeeDragChart.tsx
src/features/results/DetailComparisonTable.tsx
src/features/cashflows/CashflowTable.tsx
src/features/cashflows/EtfPayoutTable.tsx
src/features/assumptions/AssumptionsPanel.tsx
src/features/assumptions/CalculationWarnings.tsx
```

Tasks:

1. Extract in leaf-first order to minimize intermediate broken states. Recommended sequence:
   a. Pure display tables and charts that accept only data props: `EtfPayoutTable`, `CapitalChart`, `PensionChart`, `FeeDragChart`.
   b. Computation-result display: `CalculationWarnings`, `SummaryMetrics`, `DetailComparisonTable`.
   c. Assumptions and scenario controls: `AssumptionsPanel`, `ScenarioPresetPanel`, `ReturnScenarioEditor`.
   d. Product-specific input panels (mutually independent): `BavInputs`, `InsuranceInputs`, `BasisrenteInputs`, `AltersvorsorgedepotInputs`, `RiesterInputs`.
   e. Cross-cutting inputs last: `ProfileInputs`, `CashflowTable`.
2. Keep props plain and explicit. Avoid introducing new global state.
3. Preserve all CSS class names exactly. Leave all styles in `App.css` for now; co-location happens in Phase 4.

Acceptance criteria:

- `App.tsx` is under 500 lines.
- No component file is over about 400 lines unless there is a clear reason.
- Each component's prop type is local, explicit, and narrow enough that an agent can edit the component without reading the entire app state shape.
- All CSS class names are unchanged; `App.css` is not modified.
- Visual output is unchanged.
- `npm run verify` passes after each extraction batch.

## Phase 4: CSS Co-location Cleanup

Purpose: move styles out of the global `App.css` and next to the components that own them, now that the JSX extraction is stable and any visual regression is easy to isolate.

Tasks:

1. For each component extracted in Phase 3, identify its CSS selectors in `App.css`.
2. Create a co-located stylesheet (e.g., `CapitalChart.css`) beside the component file.
3. Move those selectors into the co-located file and import it from the component.
4. Verify visually after each component's styles are moved before proceeding to the next.
5. At the end, `App.css` should retain only truly global styles (resets, variables, layout scaffolding).

Acceptance criteria:

- Each feature component owns its styles in a co-located file.
- No orphaned selectors remain in `App.css` for extracted components.
- Visual output is unchanged.
- `npm run verify` passes.

## Phase 5: Test Fixtures And Integration Baseline

Purpose: create golden fixtures and a minimal integration test before the high-risk engine surgery of Phase 6. You do not need to split every test now -- that happens in Phase 10. The goal is clean, reusable fixtures and a snapshot of current behavior.

Suggested target files:

```
src/test/factories.ts
src/engine/simulate.integration.test.ts
```

Tasks:

1. Add fixture helpers in `src/test/factories.ts`:

   ```ts
   makeProfile(overrides?)
   makeAssumptions(overrides?)
   simulateDefault(overrides?)
   resultFor(products, productId, scenarioId)
   ```

2. Create `src/engine/simulate.integration.test.ts` with golden snapshot tests covering:
   - Default scenario output for all products (net payout, after-tax lump sum, accumulation capital).
   - At least one non-default scenario (different return assumption).
   - Cross-product fairness invariant: ETF and insurance invest the same net monthly cost as bAV.
3. All existing tests in `simulate.test.ts` continue to pass unchanged.

Acceptance criteria:

- Factories produce well-typed default objects that compile without casts.
- Integration snapshot tests capture the current correct behavior.
- `npm run verify` passes.

## Phase 6: Introduce Product Simulator Registry And Co-located Validation

Purpose: replace the large product branching block in `simulate.ts` with local product simulators, and move each product's validator beside it at the same time. This phase must precede Phases 7-8.

Each product module also exports its display metadata constants here so Phase 9 (manifest) only aggregates -- it makes no new decisions.

Suggested target files:

```
src/engine/simulationContext.ts
src/engine/products/etf.ts
src/engine/products/bav.ts
src/engine/products/insurance.ts
src/engine/products/basisrente.ts
src/engine/products/altersvorsorgedepot.ts
src/engine/products/riester.ts
src/engine/products/etf.validation.ts
src/engine/products/bav.validation.ts
src/engine/products/insurance.validation.ts
src/engine/products/basisrente.validation.ts
src/engine/products/altersvorsorgedepot.validation.ts
src/engine/products/riester.validation.ts
src/engine/products/README.md
src/domain/validation/primitives.ts
```

Suggested shape:

```ts
// src/engine/simulationContext.ts
export interface SimulationContext {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  rules: GermanRules
  payoutYear: number
  yearsToRetirement: number
  bavFunding: BavFundingResult
  basisrenteFunding: BasisrenteFundingResult
  altersvorsorgedepotFunding: AltersvorsorgedepotFundingResult
  riesterFunding: RiesterFundingResult
}

// src/engine/products/etf.ts
export const metadata = {
  id: 'etf' as const,
  label: 'ETF-Sparplan',
  shortLabel: 'ETF',
  color: '#4c9be8',
  order: 0,
  lockedCapital: false,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): EtfProductResult { ... }
```

Each product exports a named `simulate` function. There is no generic `ProductSimulator<T>` interface -- a generic over six known products adds complexity without benefit. The registry in `simulate.ts` is a plain import list:

```ts
import { simulate as simulateEtf } from './products/etf'
import { simulate as simulateBav } from './products/bav'
// ...

export function simulateRetirementComparison(...): SimulationResult {
  const ctx = buildContext(...)
  return scenarios.flatMap(scenario => [
    simulateEtf(ctx, scenario),
    simulateBav(ctx, scenario),
    // ...
  ])
}
```

Tasks:

1. Define `SimulationContext` in `simulationContext.ts`.
2. Extract common `buildProductResult` behavior into reusable helpers.
3. Move primitive guards (`isFiniteNumber`, `inRange`, `intInRange`) into `src/domain/validation/primitives.ts`.
4. Move ETF simulation, its metadata constants, and its validator first (simplest baseline). Verify integration tests still pass before proceeding.
5. Move bAV, then insurance (including paid-up/surrender logic), then Basisrente, AVD, Riester -- each with its validator and metadata constants.
6. Add `src/engine/products/README.md` as a compact product-module index. For each product, list the simulator file, validator file, domain type file, test file, and one-line behavioral scope.
7. Leave `simulateRetirementComparison` as a short orchestration function.
8. Keep `validateAssumptions` in `scenarioSchema.ts` as a composition layer that delegates to product validators.

Acceptance criteria:

- `simulate.ts` is mostly orchestration, ideally under 200 lines.
- Each product module owns its own payout, tax wiring, validator, and metadata constants.
- `src/engine/products/README.md` lets an agent route to a product without opening all product files.
- Integration snapshot tests from Phase 5 continue to pass after each product is moved.
- Adding a product requires adding one file and one import in `simulate.ts`.
- `npm run verify` passes.

## Phase 7: Split Domain Types

Purpose: reduce the "read all domain concepts" cost of touching one product. Phase 6's module boundaries determine the correct split lines.

`src/domain/products.ts` would become the new mini-`types.ts`, so use a per-product subdirectory instead.

Suggested target files:

```
src/domain/products/common.ts        (ProductId, PayoutMode, shared result fields)
src/domain/products/bav.ts           (BavAssumptions, BavFundingResult, ...)
src/domain/products/insurance.ts     (InsuranceAssumptions, InsuranceTaxMode, ...)
src/domain/products/basisrente.ts
src/domain/products/altersvorsorgedepot.ts
src/domain/products/riester.ts
src/domain/products/etf.ts
src/domain/products/index.ts         (re-exports all product types)
src/domain/profile.ts
src/domain/fees.ts
src/domain/rules.ts
src/domain/results.ts
src/domain/retirementTax.ts
src/domain/index.ts                  (main import surface)
```

Tasks:

1. Move related interfaces and type aliases from `src/domain/types.ts` into the focused modules above, following the product boundaries established in Phase 6.
2. Add `src/domain/index.ts` and `src/domain/products/index.ts` as the main import surfaces.
3. Keep product-specific imports available directly from `src/domain/products/<product>.ts`; do not force every caller through `src/domain/index.ts`.
4. Update imports gradually file by file.
5. Keep `types.ts` temporarily as a compatibility barrel during migration, then remove it once all imports move.
6. Avoid adding large docblocks to the new type files. Put long legal rationale in research docs or product notes and link to it.

Acceptance criteria:

- Each product's assumption and result types live in `src/domain/products/<product>.ts`.
- Rule types are isolated from UI/result types.
- No circular type imports.
- No new mega-barrel becomes required for normal product-level edits.
- `npm run verify` passes.

## Phase 8: Introduce Discriminated Product Results

Purpose: let TypeScript encode which result fields exist for each product.

Tasks:

1. Replace the single broad `ProductResult` interface with product-specific result interfaces:
   - `EtfProductResult`
   - `BavProductResult`
   - `InsuranceProductResult`
   - `BasisrenteProductResult`
   - `AltersvorsorgedepotProductResult`
   - `RiesterProductResult`
2. Keep shared fields in a `BaseProductResult`.
3. Define:

   ```ts
   export type ProductResult =
     | EtfProductResult
     | BavProductResult
     | InsuranceProductResult
     | BasisrenteProductResult
     | AltersvorsorgedepotProductResult
     | RiesterProductResult
   ```

4. Move product-only fields to the correct branch:
   - `etfPayoutRows` only on ETF
   - `paidUpScenario` only on private insurance
   - `afterTaxLumpSum: null` on locked products where applicable

Acceptance criteria:

- UI and CSV code use narrowing by `productId`.
- Product-only fields are not optional on unrelated products.
- `npm run verify` passes.

## Phase 9: Product Manifest

Purpose: centralize product display metadata by aggregating the constants already exported from each product module in Phase 6. This phase makes no new decisions about what metadata to store.

Suggested target file:

```
src/engine/productManifest.ts
```

Suggested shape:

```ts
import { metadata as etfMeta } from './products/etf'
import { metadata as bavMeta } from './products/bav'
// ...

export const PRODUCT_MANIFEST = [etfMeta, bavMeta, ...] as const
export type ProductManifestEntry = typeof PRODUCT_MANIFEST[number]
```

Do not put this file under `src/domain/`. The domain layer should not import engine product modules.

Tasks:

1. Aggregate `metadata` exports from each Phase 6 product module into `PRODUCT_MANIFEST`.
2. Replace any remaining parallel lists in `productPresentation.ts` (from Phase 2), charts, tables, and CSV code with manifest lookups.
3. Add small lookup helpers such as `getProductMeta(productId)` so UI code does not repeatedly reimplement manifest scans.

Acceptance criteria:

- There is one canonical source for product ordering, labels, and colors.
- UI code no longer hardcodes product display metadata.
- `productPresentation.ts` from Phase 2 can be deleted or reduced to a thin wrapper.
- The domain layer does not import from `src/engine`.
- `npm run verify` passes.

## Phase 10: Split Simulation Tests

Purpose: make tests targeted enough that agents can find and update the correct cases quickly. Factories already exist from Phase 5; this phase co-locates tests with product modules.

Suggested target files:

```
src/engine/products/etf.test.ts
src/engine/products/bav.test.ts
src/engine/products/insurance.test.ts
src/engine/products/basisrente.test.ts
src/engine/products/altersvorsorgedepot.test.ts
src/engine/products/riester.test.ts
```

Tasks:

1. Split `src/engine/simulate.test.ts` by product/behavior, moving each product's tests into the matching `src/engine/products/<product>.test.ts` file. Use the factories from `src/test/factories.ts`.
2. The integration snapshot file from Phase 5 (`simulate.integration.test.ts`) absorbs any remaining cross-product or fairness tests.
3. Delete or reduce `simulate.test.ts` once its contents have fully moved.
4. Avoid giant copied default objects inside tests -- use the factories instead.

Acceptance criteria:

- No test file is over about 500 lines.
- Product tests live beside the product module.
- Existing test count and coverage intent are preserved or improved.
- `npm run verify` passes.

## Phase 11: Documentation Cleanup And Agent Navigation Map

Purpose: make docs match the final topology and produce compact context maps now that the structure is stable.

Tasks:

1. Write `AGENTS.md` (or `docs/agent-map.md`) against the final file structure. Document common change paths:
   - bAV funding changes
   - retirement tax/KV-PV changes
   - adding or modifying a product
   - adding a rule year
   - changing UI inputs
   - changing CSV/export behavior
2. Include the standard verification command in the agent map.
3. Add a `docs/context/` folder with short context capsules:
   - `docs/context/products.md`: one table mapping products to simulator, validator, domain types, tests, UI input component, and research source.
   - `docs/context/rules-and-tax.md`: one table mapping legal/rule areas to source files and research docs.
   - `docs/context/ui.md`: one table mapping screens/sections to feature components and CSS files.
4. Add source anchors to long research docs where needed, so implementation comments can link to stable section names instead of repeating paragraphs.
5. Update `CLAUDE.md` key file table.
6. Update `README.md` main source files.
7. Update `DESIGN.md` technical architecture tree.
8. Update `BACKLOG.md` only if refactor phases close or change planned work.

Acceptance criteria:

- A new agent can answer "which files do I need for this task?" from the map without reading the full app.
- The map is short enough to remain useful, ideally under 200 lines.
- Each `docs/context/*.md` file is short enough to read quickly, ideally under 150 lines.
- No stale references to `App.tsx` or `simulate.ts` as the home of all behavior.
- `npm run verify` passes.

## Suggested Execution Order

Linear sequence with notes on parallelism:

```
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4
                                                |
                                            Phase 5   (golden fixtures -- gate for Phase 6)
                                                |
                                            Phase 6   (simulators -- gate for Phases 7 and 8)
                                                |
                                            Phase 7
                                                |
                                            Phase 8
                                                |
                           Phase 9 and Phase 10 can run in parallel here
                                                |
                                            Phase 11
```

Parallelism window: after Phase 8 is complete, Phases 9 (manifest) and 10 (test split) are independent and can run concurrently. Do not parallelize any work that touches `src/domain` during Phases 7-8. Do not parallelize Phase 3 (UI feature extraction) with Phase 6 (engine extraction) -- both generate import churn across the codebase that causes merge conflicts.

## Risk Notes

- The highest-risk behavior is the tax and KV/PV routing in product simulations. The integration snapshot tests from Phase 5 are the primary safety net for Phase 6. Run them after every product module is moved.
- Phase 3 (`App.tsx` extraction) can easily create prop-drilling noise. Prefer local feature components with explicit props rather than introducing global state.
- Phase 4 (CSS co-location) is low-risk but tedious. Verify visually after each component's styles are moved; do not batch multiple components into one unverified commit.
- Product result discriminated unions (Phase 8) will produce many compile errors at once. Treat those errors as migration guidance rather than a reason to weaken the types.
- Storage and URL validation must remain backward-compatible with saved user states throughout Phase 6's validator migration.
- Legal comments should move with the code they explain. Avoid leaving source-law context stranded in old files.
- Context docs can become stale if they duplicate too much. Prefer file-path tables and "read this first" guidance over restating implementation details.
- Avoid central "everything exports everything" barrels. They look convenient but make agents and static analysis traverse more code than needed.

## Definition Of Done

The refactor is complete when:

- `App.tsx` is a small composition component.
- `simulate.ts` is a short orchestration function.
- Each product has a local simulator, co-located validator, co-located tests, and exported metadata constants in `src/engine/products/`.
- Domain types are split into per-product files under `src/domain/products/`.
- Product-specific result fields are represented by discriminated unions.
- `npm run repo:stats` gives a concise context inventory for future agents.
- `npm run verify` passes.
- `CLAUDE.md`, `README.md`, `DESIGN.md`, and `AGENTS.md` describe the new structure accurately.
