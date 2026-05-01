# Rentenrechner — Developer Guide (Claude Code)

German retirement calculator comparing ETF, bAV, private insurance, Basisrente, Altersvorsorgedepot, and Riester.
Stack: React + TypeScript + Vite. No backend.

## Commands

```bash
npm run verify          # lint + tests + build (run this after every change)
npx vitest run          # unit tests only
npx tsc --noEmit        # type-check only
npm run dev             # dev server
npm run build           # production build
npm run repo:stats      # file/symbol inventory
```

## Quick Navigation

For a task, read the matching context capsule first — it is faster than reading source files cold.

| Task | Start here |
|------|-----------|
| Change a product's calculation | `docs/context/products.md`, then the product's `src/engine/products/<product>.ts` |
| Change tax or social-security rules | `docs/context/rules-and-tax.md` |
| Change UI layout or inputs | `docs/context/ui.md` |
| Add a new product | `src/engine/products/README.md` |
| Update 2026 rule values | `src/rules/de2026.ts` |

## Key Files

### Rules and constants

| File | Role |
|------|------|
| `src/rules/de2026.ts` | All 2026 year-specific statutory values (BBG, GKV/PV rates, Rentenwert, Basiszins, cohort tables, Pauschbeträge). Update once a year when the BBG-Bekanntmachung and rate adjustments are published. Never hardcode statutory numbers in the engine. |
| `src/rules/legalConstants.ts` | Cross-year statutory constants: 1/120 SGB V spreading, §34 EStG Fünftelregelung divisor, §20 Abs. 1 Nr. 6 EStG age/runtime thresholds, halbeinkünfte factor. Change only when the underlying law changes (not on the annual rate-update cycle). |
| `src/rules/index.ts` | Re-exports `activeRules` (year-specific) and `legalConstants`. To swap rule years: add `de2027.ts`, change one line in `index.ts` to point `activeRules` at the new year, run tests. |

### Domain types

| File | Role |
|------|------|
| `src/domain/index.ts` | Main import surface for all shared types. Import from here unless you need only one product's types. |
| `src/domain/products/<product>.ts` | Per-product assumption and result types (BavAssumptions, InsuranceAssumptions, etc.). Six files: `bav`, `etf`, `insurance`, `basisrente`, `altersvorsorgedepot`, `riester`. |
| `src/domain/profile.ts` | `PersonalProfile`, `FilingStatus`. |
| `src/domain/results.ts` | `BaseProductResult`, discriminated `ProductResult` union, `SimulationResult`. |

### Engine — tax, salary, and retirement

| File | Role |
|------|------|
| `src/data/defaultScenario.ts` | Default profile and assumptions used by tests and initial UI state. |
| `src/engine/tax.ts` | `calculateIncomeTax2026`, `calculateSolidarityTax`, `calculateCapitalGainsTax`. |
| `src/engine/salary.ts` | `calculateSalaryResult` (BMF PAP Vorsorgepauschale), `calculateBavFunding` (two-pass bAV limit logic). |
| `src/engine/retirementTax.ts` | `calculateRetirementTax` — retirement-phase taxable-income pipeline. All retirement payout helpers must go through this. |
| `src/engine/projections.ts` | `projectAccumulation` (accumulation loop), `netBavPayout`, `netInsurancePayout`, `afterTaxInvestmentCapital`, `afterTaxInsuranceLumpSum`, `afterTaxBavLumpSum`, `deriveInsuranceTaxMode`, `deriveBavLumpSumTaxMode`, `etfPayoutSchedule`. |
| `src/engine/fees.ts` | `computeRIY` — RIY/Effektivkosten bisection solver (60-iteration, beginning-of-period annuity FV). |
| `src/engine/bavWarnings.ts` | Fee threshold warnings and one-click fee presets (Nettotarif / Standard / Hochkosten / Hoher AG-Match). |
| `src/engine/grv.ts` | `projectStatutoryPension` — EP-based GRV estimate or manual override; §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil tax; KV/PV via §249a SGB V half-rate for KVdR members. |
| `src/engine/basisrente.ts` | `calculateBasisrenteFunding` (§10 Abs. 3 EStG Schicht-1 cap, marginal tax saving) and `netBasisrentePayout` (§22 Besteuerungsanteil + freiwillig §240 KV/PV). |
| `src/engine/altersvorsorgedepot.ts` | AVD accumulation, allowance engine (Grundzulage, Kinderzulage, Günstigerprüfung), Standarddepot glidepath, §22 Nr. 5 EStG payout. |
| `src/engine/riester.ts` | §84–§86 EStG allowances, Mindesteigenbeitrag, §10a Günstigerprüfung, §22 Nr. 5 EStG payout, §93 Abs. 2 partial lump sum. |

### Engine — simulation orchestration

| File | Role |
|------|------|
| `src/engine/simulationContext.ts` | `SimulationContext` interface and `buildContext` — computes pre-scenario funding results (bAV, Basisrente, AVD, Riester) shared across all product simulators. |
| `src/engine/buildResult.ts` | `buildProductResult` — runs accumulation + payout/tax pipeline; assembles the discriminated `ProductResult`. All product simulators call this. |
| `src/engine/simulate.ts` | Top-level `simulateRetirementComparison` — short orchestration: builds context, calls each product's `simulate()`, returns `ProductResult[]`. Under 200 lines. |
| `src/engine/productRegistry.ts` | `PRODUCT_REGISTRY` (metadata, assumption key, simulator, validator), `PRODUCT_MANIFEST`, `PRODUCT_IDS`, `getProductMeta(id)`, and the `ProductId` type itself (derived from each product's `metadata.id` literal). Single source of truth for product ids, labels, colors, validators, and sort order. |
| `src/engine/productManifest.ts` | Compatibility re-export of manifest helpers from `productRegistry.ts`. |
| `src/engine/products/` | One subdirectory containing `<product>.ts` (simulator), `<product>.validation.ts` (validator), `<product>.test.ts` (unit tests) per product. See `src/engine/products/README.md` for the routing table. |

### App layer

| File | Role |
|------|------|
| `src/app/useCalculatorState.ts` | localStorage and URL initialization, persistence, scenario CRUD. |
| `src/app/useSimulationViewModel.ts` | Runs simulation, derives chart data, pension bars, sort order, best-result selection. |
| `src/app/productPresentation.ts` | Fee presets (bAV / pAV), calculation-warning metadata, `GRV_COLOR`. Re-exports manifest helpers. |
| `src/App.tsx` | Composition shell (~500 lines). Composes feature sections; no calculation logic. |
| `src/features/` | Feature components: `inputs/`, `results/`, `cashflows/`, `assumptions/` — each with co-located CSS. |
| `src/ui/` | Shared UI primitives: `NumberField`, `ResultMetric`, `BavWaterfall`, `formatting.ts`, `helpers.ts`. |

### Storage, utils, and tests

| File | Role |
|------|------|
| `src/storage.ts` | `loadState` / `saveState` — localStorage persistence with `mergeDeep` schema migration; version field guards forward-compat. |
| `src/utils/scenarioSchema.ts` | `validateAndMigrateState` — range/shape validation for URL and localStorage state (finite numbers, age invariants, fee bounds, scenario array shape). |
| `src/utils/urlShare.ts` | `buildShareUrl` / `readUrlState` — base64url `?s=` share-URL encoding and decoding. |
| `src/utils/csvExport.ts` | `exportCsv` — UTF-8 BOM CSV with three sections: summary comparison, yearly cashflows (all products/scenarios), ETF payout schedule. |
| `src/test/factories.ts` | `makeProfile`, `makeAssumptions`, `simulateDefault`, `resultFor` — test fixture helpers used by all product test files. |
| `src/engine/simulate.integration.test.ts` | Cross-product golden snapshots and fairness invariant. Run after touching accumulation or payout logic. |

## Non-Obvious Architecture

**Vorsorgepauschale** (`salary.ts`): taxable income deducts only RV + GKV + PV (no AV/unemployment). `SalaryResult.vorsorgepauschale` exposes this for audit. `calculateSalaryResult` accepts optional `effectiveTaxFreeConversion` / `effectiveSvFreeConversion` overrides used by `calculateBavFunding` when the employer share has already consumed part of the §3 Nr. 63 / §1 SvEV limits.

**bAV two-pass** (`salary.ts`): `calculateBavFunding` does a first pass to estimate employer subsidy, computes total bAV against the 8%/4%-BBG limits, then reruns salary with the corrected employee effective limits. `BavFundingResult` carries `taxableOverflowAnnual` / `svLiableOverflowAnnual`.

**Fee model** (`projections.ts`): `FeeModel` now has `wrapperAssetFee` (Versicherungsmantel p.a.) and `fundAssetFee` (Fonds/ETF TER p.a.) instead of a single `annualAssetFee`; `projectAccumulation` uses their sum. ETF uses only `annualAssetFee` (no wrapper/fund split). `pensionPayoutFeePct` is deducted from gross monthly Leibrente/Zeitrente before income-tax and KV/PV for bAV and pAV only. `yearlyFees` / `totalFees` reflect all asset-based drag; `accumulationRiy` (on `ProductResult`) exposes RIY in pp computed by `computeRIY` in `fees.ts`.

**Accumulation policy** (`accumulation.ts`): `AccumulationInput` carries the always-required fields (contributions, return, fees, etc.); the opt-in behaviors live on `policy?: AccumulationPolicy` — `yearlyReturn` (per-year return override; Standarddepot glidepath today, Monte Carlo plugs in here next), `vorabpauschale` (InvStG §18 annual accrual + cost-basis carryover), and `initialCapital` (transferred starting balance for Riester→AVD and paid-up insurance phase 2). `buildResult` mirrors the shape minus `rules`, which it injects from `params.rules`. New extension policies should be added to `AccumulationPolicy` rather than as new top-level options.

**ETF Vorabpauschale** (`accumulation.ts` / `etfPayout.ts`): `projectAccumulation` accrues §18 InvStG via `policy.vorabpauschale` and tracks `cumulativeVorabpauschale` on each row. `afterTaxInvestmentCapital` and `etfPayoutSchedule` consume this to reduce the taxable gain at exit / cost-basis schedule. Only wired for ETF products.

**bAV lump sum** (`projections.ts` / `simulate.ts`): `afterTaxBavLumpSum` now routes the income-tax leg via `deriveBavLumpSumTaxMode(durchfuehrungsweg, pre2005EligibleTaxFree)` → `BavLumpSumTaxMode`. §3 Nr. 63 Durchführungswege → `voll_versorgungsbezug` (full marginal rate, §22 Nr. 5 EStG); §40b a.F. eligible → `pre2005_steuerfrei`; Direktzusage/Unterstützungskasse → `fuenftelregelung` (§34 Abs. 2 Nr. 4 EStG). KV/PV via §229 Abs. 1 Satz 3 SGB V 1/120 rule applies to all modes. Default is `direktversicherung_3_63`.

**Fair comparison**: ETF and insurance always invest `bavFunding.monthlyNetCost` — the same net cash the user actually pays for bAV. This is fixed; there is no "custom amount" toggle.

**SimulationContext / buildContext** (`simulationContext.ts`): `buildContext` runs all pre-scenario funding calculations (bAV, Basisrente, AVD, Riester) once before the scenario loop, producing a `SimulationContext` passed into every product's `simulate(ctx, scenario)` call. Product simulators must not call salary/funding helpers directly; use `ctx`.

**Product registry** (`productRegistry.ts`): `PRODUCT_REGISTRY` is the single source of truth for product display metadata, assumption key, simulator, and validator. Each product module in `src/engine/products/` exports a `metadata` constant (with `id: '<id>' as const`); the registry aggregates them. The `ProductId` type is derived from `PRODUCT_MANIFEST[*].id`, so adding a product never requires editing a hardcoded union — `domain/products/common.ts` re-exports `ProductId` from the registry. `simulate.ts`, `productManifest.ts`, and `scenarioSchema.ts` all consume the registry, so adding a product is local to `engine/products/`, the per-product domain types, and one new entry in `PRODUCT_REGISTRY`. Use `getProductMeta(productId)` in UI code instead of local color/order maps.

**Private insurance tax** (`projections.ts` / `simulate.ts`): `deriveInsuranceTaxMode(contractStartYear, runtimeYears, retirementAge)` returns `'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer'`. `netInsurancePayout` and `afterTaxInsuranceLumpSum` implement each branch — routing through `calculateRetirementTax`. Contract runtime is auto-derived as `retirementAge - age`.

**KVdR toggle** (`projections.ts`): `netBavPayout(..., kvdrMember = true)`. When `true`: KV Freibetrag §226(2) SGB V; when `false` (freiwillig versichert): KV on full amount §240 SGB V. PV (Freigrenze + Versorgungsträger employer share) is the same in both cases.

**Retirement tax pipeline** (`retirementTax.ts`): All retirement-phase income-tax flows go through `calculateRetirementTax(components, rules, filingStatus)`. It applies cohort-based allowances (`besteuerungsanteilGrv`, `versorgungsfreibetrag`), routes private insurance by tax mode (halbeinkuenfte / abgeltungsteuer / pre2005), and deducts Werbungskosten-Pauschbeträge + Sonderausgaben before calling `calculateIncomeTax2026`. The `bavIsLumpSum` flag on `RetirementIncomeComponents` suppresses the Versorgungsfreibetrag for one-time payouts (Fünftelregelung context). The `retirementYear` parameter is required by all callers so cohort tables lock to the correct year.

**Payout modes** (`projections.ts` / `simulate.ts`): bAV and pAV support `payoutMode: 'leibrente' | 'zeitrente' | 'kapitalverzehr'`. `leibrente` → `grossMonthlyPayout = capital / 10_000 × rentenfaktor` (independent of `retirementEndAge`). `zeitrente` → depletion annuity over `zeitrenteYears`. `kapitalverzehr` → depletion annuity over `retirementEndAge − retirementAge` (ETF always uses this path). Defaults: bAV `leibrente` RF 30, pAV `leibrente` RF 28.

**PKV employer subsidy** (`salary.ts`): when `publicHealthInsurance = false`, `calculatePkv257Subsidy` computes the §257 SGB V employer subsidy (capped at half the actual PKV premium, §3 Nr. 62 EStG tax-free for the employee). The Vorsorgepauschale KV/PV Teilbetrag uses the actual PKV premium (§39b EStG). Net PKV cost (`pkvNetMonthlyCost`) is deducted from `annualNet` and flows into the fair-comparison benchmark.

**GRV statutory pension** (`grv.ts`): `projectStatutoryPension` estimates the GRV baseline from Entgeltpunkte (EP) × Rentenwert × Zugangsfaktor, or accepts a manual monthly override. Payout taxed via §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil cohort table (locked to `retirementYear`). KV/PV uses §249a SGB V half-rate for KVdR members; freiwillig path for non-members. bAV GRV reduction flows in from `bavFunding.estimatedMonthlyGrvReduction`.

**Basisrente / Rürup** (`basisrente.ts`): Schicht-1 (§10 Abs. 1 Nr. 2 EStG). `calculateBasisrenteFunding` computes the remaining §10 Abs. 3 Schicht-1 cap after GRV (employee + employer) and the marginal tax saving on the salary-phase zvE. `netBasisrentePayout` taxes via the GRV Besteuerungsanteil channel (statutory pension annual) and applies freiwillig §240 SGB V KV/PV (full rate, no Freibetrag — Basisrente is not a Versorgungsbezug). Capital payout is legally prohibited: `afterTaxLumpSum = null`. Only `leibrente` and `zeitrente` payout modes are valid.

**Ertragsanteil** (`projections.ts`): `netInsurancePayout` checks `payoutMode === 'leibrente'` for private insurance and applies the §22 Nr. 1 Satz 3 a EStG Ertragsanteil table (age-keyed) instead of the Halbeinkünfte or pre-2005 rules when the product is a lifelong annuity. Only the taxable portion (Ertragsanteil × grossMonthlyPayout) enters the income-tax pipeline; lump-sum tax modes are unchanged.

**Leibrente break-even age** (`simulate.ts`): `leibrenteBreakEvenAge` on `ProductResult` = `retirementAge + capital / (grossMonthlyPayout × 12)` — the nominal age at which cumulative gross payouts recoup the retirement capital. Populated for bAV, insurance, and Basisrente when `payoutMode === 'leibrente'`; `undefined` otherwise.

## Current State

Agent-readability refactor phases 0–11 complete. All 399 tests pass.
See `BACKLOG.md` for open feature work and recommended order.
