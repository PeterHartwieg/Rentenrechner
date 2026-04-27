# Rentenrechner — Developer Guide

German retirement calculator comparing ETF, bAV, and private insurance.
Stack: React + TypeScript + Vite. No backend.

## Commands

```bash
npx vitest run          # unit tests
npx tsc --noEmit        # type-check
npm run dev             # dev server
npm run build           # production build
```

## Key Files

| File | Role |
|------|------|
| `src/rules/de2026.ts` | All 2026 statutory values (BBG, rates, limits). Single source of truth — never hardcode numbers in the engine. Also exports `besteuerungsanteilGrv`, `versorgungsfreibetrag`, and Pauschbeträge constants. |
| `src/domain/types.ts` | All shared types. Read this first. |
| `src/data/defaultScenario.ts` | Default profile and assumptions used by tests and initial UI state. |
| `src/engine/tax.ts` | `calculateIncomeTax2026`, `calculateSolidarityTax`, `calculateCapitalGainsTax`. |
| `src/engine/salary.ts` | `calculateSalaryResult` (BMF PAP Vorsorgepauschale), `calculateBavFunding` (two-pass bAV limit logic). |
| `src/engine/retirementTax.ts` | `calculateRetirementTax` — retirement-phase taxable-income pipeline. All retirement payout helpers must go through this. |
| `src/engine/projections.ts` | `projectAccumulation` (accumulation loop), `netBavPayout`, `netInsurancePayout`, `afterTaxInvestmentCapital`, `afterTaxInsuranceLumpSum`, `afterTaxBavLumpSum`, `deriveInsuranceTaxMode`, `deriveBavLumpSumTaxMode`, `etfPayoutSchedule`. |
| `src/engine/simulate.ts` | Top-level `simulateRetirementComparison` — wires salary + projections into `ProductResult[]`. |
| `src/App.tsx` | Single-page UI. All state lives here. |

## Non-Obvious Architecture

**Vorsorgepauschale** (`salary.ts`): taxable income deducts only RV + GKV + PV (no AV/unemployment). `SalaryResult.vorsorgepauschale` exposes this for audit. `calculateSalaryResult` accepts optional `effectiveTaxFreeConversion` / `effectiveSvFreeConversion` overrides used by `calculateBavFunding` when the employer share has already consumed part of the §3 Nr. 63 / §1 SvEV limits.

**bAV two-pass** (`salary.ts`): `calculateBavFunding` does a first pass to estimate employer subsidy, computes total bAV against the 8%/4%-BBG limits, then reruns salary with the corrected employee effective limits. `BavFundingResult` carries `taxableOverflowAnnual` / `svLiableOverflowAnnual`.

**TER as explicit fee** (`projections.ts`): `projectAccumulation` tracks gross growth and monthly TER deduction separately so `yearlyFees` / `totalFees` actually includes the asset-management drag. Capital values are mathematically identical to a combined-rate formula.

**ETF Vorabpauschale** (`projections.ts` / `simulate.ts`): `projectAccumulation` receives an optional `etfVorabpauschale` config and accumulates `cumulativeVorabpauschale` on each row. `afterTaxInvestmentCapital` and `netEtfPayout` accept this to reduce the taxable gain at exit. Only wired for `taxMode === 'etf'`.

**bAV lump sum** (`projections.ts` / `simulate.ts`): `afterTaxBavLumpSum` now routes the income-tax leg via `deriveBavLumpSumTaxMode(durchfuehrungsweg, pre2005EligibleTaxFree)` → `BavLumpSumTaxMode`. §3 Nr. 63 Durchführungswege → `voll_versorgungsbezug` (full marginal rate, §22 Nr. 5 EStG); §40b a.F. eligible → `pre2005_steuerfrei`; Direktzusage/Unterstützungskasse → `fuenftelregelung` (§34 Abs. 2 Nr. 4 EStG). KV/PV via §229 Abs. 1 Satz 3 SGB V 1/120 rule applies to all modes. Default is `direktversicherung_3_63`.

**Fair comparison**: ETF and insurance always invest `bavFunding.monthlyNetCost` — the same net cash the user actually pays for bAV. This is fixed; there is no "custom amount" toggle.

**`rowAfterTaxBalance`** in `App.tsx`: a closure that captures `assumptions` and `cashflowProductId` to compute the per-row after-tax balance for the cashflow table. It lives just before the `return` statement.

**Private insurance tax** (`projections.ts` / `simulate.ts`): `deriveInsuranceTaxMode(contractStartYear, runtimeYears, retirementAge)` returns `'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer'`. `netInsurancePayout` and `afterTaxInsuranceLumpSum` implement each branch — routing through `calculateRetirementTax`. Contract runtime is auto-derived as `retirementAge - age`.

**KVdR toggle** (`projections.ts`): `netBavPayout(..., kvdrMember = true)`. When `true`: KV Freibetrag §226(2) SGB V; when `false` (freiwillig versichert): KV on full amount §240 SGB V. PV (Freigrenze + Versorgungsträger employer share) is the same in both cases.

**Retirement tax pipeline** (`retirementTax.ts`): All retirement-phase income-tax flows go through `calculateRetirementTax(components, rules, filingStatus)`. It applies cohort-based allowances (`besteuerungsanteilGrv`, `versorgungsfreibetrag`), routes private insurance by tax mode (halbeinkuenfte / abgeltungsteuer / pre2005), and deducts Werbungskosten-Pauschbeträge + Sonderausgaben before calling `calculateIncomeTax2026`. The `bavIsLumpSum` flag on `RetirementIncomeComponents` suppresses the Versorgungsfreibetrag for one-time payouts (Fünftelregelung context). The `retirementYear` parameter is required by all callers so cohort tables lock to the correct year.

## Current State

See `BACKLOG.md` for open items and recommended order.
Wave 2 complete: #46 retirement-tax pipeline, #47 KV/PV BBG caps, #48 bAV lump-sum tax routing.
Next: #41 restore clean build/lint, #42 bAV minimum-conversion warning fix.
