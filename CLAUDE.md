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
| `src/rules/de2026.ts` | All 2026 year-specific statutory values (BBG, GKV/PV rates, Rentenwert, Basiszins, cohort tables, Pauschbeträge). Update once a year when the BBG-Bekanntmachung and rate adjustments are published. Never hardcode statutory numbers in the engine. |
| `src/rules/legalConstants.ts` | Cross-year statutory constants: 1/120 SGB V spreading, §34 EStG Fünftelregelung divisor, §20 Abs. 1 Nr. 6 EStG age/runtime thresholds, halbeinkünfte factor. Change only when the underlying law changes (not on the annual rate-update cycle). |
| `src/rules/index.ts` | Re-exports `activeRules` (year-specific) and `legalConstants`. To swap rule years: add `de2027.ts`, change one line in `index.ts` to point `activeRules` at the new year, run tests. |
| `src/domain/types.ts` | All shared types. Read this first. |
| `src/data/defaultScenario.ts` | Default profile and assumptions used by tests and initial UI state. |
| `src/engine/tax.ts` | `calculateIncomeTax2026`, `calculateSolidarityTax`, `calculateCapitalGainsTax`. |
| `src/engine/salary.ts` | `calculateSalaryResult` (BMF PAP Vorsorgepauschale), `calculateBavFunding` (two-pass bAV limit logic). |
| `src/engine/retirementTax.ts` | `calculateRetirementTax` — retirement-phase taxable-income pipeline. All retirement payout helpers must go through this. |
| `src/engine/projections.ts` | `projectAccumulation` (accumulation loop), `netBavPayout`, `netInsurancePayout`, `afterTaxInvestmentCapital`, `afterTaxInsuranceLumpSum`, `afterTaxBavLumpSum`, `deriveInsuranceTaxMode`, `deriveBavLumpSumTaxMode`, `etfPayoutSchedule`. |
| `src/engine/fees.ts` | `computeRIY` — RIY/Effektivkosten bisection solver (60-iteration, beginning-of-period annuity FV). |
| `src/engine/bavWarnings.ts` | Fee threshold warnings and one-click fee presets (Nettotarif / Standard / Hochkosten / Hoher AG-Match). |
| `src/engine/grv.ts` | `projectStatutoryPension` — EP-based GRV estimate or manual override; §22 Nr. 1 Satz 3 a aa EStG Besteuerungsanteil tax; KV/PV via §249a SGB V half-rate for KVdR members. |
| `src/engine/basisrente.ts` | `calculateBasisrenteFunding` (§10 Abs. 3 EStG Schicht-1 cap, marginal tax saving) and `netBasisrentePayout` (§22 Besteuerungsanteil + freiwillig §240 KV/PV). |
| `src/engine/simulate.ts` | Top-level `simulateRetirementComparison` — wires salary + projections into `ProductResult[]`. |
| `src/storage.ts` | `loadState` / `saveState` — localStorage persistence with `mergeDeep` schema migration; version field guards forward-compat. |
| `src/utils/scenarioSchema.ts` | `validateAndMigrateState` — range/shape validation for URL and localStorage state (finite numbers, age invariants, fee bounds, scenario array shape). |
| `src/utils/urlShare.ts` | `buildShareUrl` / `readUrlState` — base64url `?s=` share-URL encoding and decoding. |
| `src/utils/csvExport.ts` | `exportCsv` — UTF-8 BOM CSV with three sections: summary comparison, yearly cashflows (all products/scenarios), ETF payout schedule. |
| `src/App.tsx` | Single-page UI. All state lives here. |

## Non-Obvious Architecture

**Vorsorgepauschale** (`salary.ts`): taxable income deducts only RV + GKV + PV (no AV/unemployment). `SalaryResult.vorsorgepauschale` exposes this for audit. `calculateSalaryResult` accepts optional `effectiveTaxFreeConversion` / `effectiveSvFreeConversion` overrides used by `calculateBavFunding` when the employer share has already consumed part of the §3 Nr. 63 / §1 SvEV limits.

**bAV two-pass** (`salary.ts`): `calculateBavFunding` does a first pass to estimate employer subsidy, computes total bAV against the 8%/4%-BBG limits, then reruns salary with the corrected employee effective limits. `BavFundingResult` carries `taxableOverflowAnnual` / `svLiableOverflowAnnual`.

**Fee model** (`projections.ts`): `FeeModel` now has `wrapperAssetFee` (Versicherungsmantel p.a.) and `fundAssetFee` (Fonds/ETF TER p.a.) instead of a single `annualAssetFee`; `projectAccumulation` uses their sum. ETF uses only `annualAssetFee` (no wrapper/fund split). `pensionPayoutFeePct` is deducted from gross monthly Leibrente/Zeitrente before income-tax and KV/PV for bAV and pAV only. `yearlyFees` / `totalFees` reflect all asset-based drag; `accumulationRiy` (on `ProductResult`) exposes RIY in pp computed by `computeRIY` in `fees.ts`.

**ETF Vorabpauschale** (`projections.ts` / `simulate.ts`): `projectAccumulation` receives an optional `etfVorabpauschale` config and accumulates `cumulativeVorabpauschale` on each row. `afterTaxInvestmentCapital` and `netEtfPayout` accept this to reduce the taxable gain at exit. Only wired for `taxMode === 'etf'`.

**bAV lump sum** (`projections.ts` / `simulate.ts`): `afterTaxBavLumpSum` now routes the income-tax leg via `deriveBavLumpSumTaxMode(durchfuehrungsweg, pre2005EligibleTaxFree)` → `BavLumpSumTaxMode`. §3 Nr. 63 Durchführungswege → `voll_versorgungsbezug` (full marginal rate, §22 Nr. 5 EStG); §40b a.F. eligible → `pre2005_steuerfrei`; Direktzusage/Unterstützungskasse → `fuenftelregelung` (§34 Abs. 2 Nr. 4 EStG). KV/PV via §229 Abs. 1 Satz 3 SGB V 1/120 rule applies to all modes. Default is `direktversicherung_3_63`.

**Fair comparison**: ETF and insurance always invest `bavFunding.monthlyNetCost` — the same net cash the user actually pays for bAV. This is fixed; there is no "custom amount" toggle.

**`rowAfterTaxBalance`** in `App.tsx`: a closure that captures `assumptions` and `cashflowProductId` to compute the per-row after-tax balance for the cashflow table. It lives just before the `return` statement.

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

See `BACKLOG.md` for open items and recommended order.
Waves 3–8 complete: #41–64, #72 resolved. Key remaining open items: see BACKLOG.md.
