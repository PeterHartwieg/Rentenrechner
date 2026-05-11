# RentenWiki.de Pure Front-End API (v1)

Stable, versioned TypeScript facade over the RentenWiki retirement comparison and tax engines. All functions are pure, synchronous, and free of browser, React, network, or storage dependencies.

All numeric outputs are exact floats. No display rounding is applied — callers own formatting.

```ts
import { getManifest, runComparison, calculateIncomeTax } from '../api'
```

> See [`api.examples.test.ts`](api.examples.test.ts) for executable usage examples — every example is a passing test.

## Quick start

```ts
import { runComparison } from '../api'

const result = runComparison({
  monthlyNettoBelastungEur: 200,
  assumptions: { visibleProducts: ['etf', 'bav'] },
})

if (result.ok) {
  for (const r of result.data.selectedResults) {
    console.log(`${r.label}: ${r.netMonthlyPayout.toFixed(2)} EUR/month`)
  }
} else {
  console.error(result.errors)
}
```

## Core concepts

### Response envelope

Every API function returns `ApiResult<T>` — a discriminated union on `ok`:

```ts
// Success
interface ApiSuccess<T> {
  ok: true
  meta: { apiVersion: 'v1'; ruleYear: number }
  data: T
  warnings: ApiDiagnostic[]
}

// Error
interface ApiError {
  ok: false
  meta: { apiVersion: 'v1'; ruleYear: number } | null
  errors: ApiDiagnostic[]
  warnings: ApiDiagnostic[]
}
```

Validation errors are never thrown — they are returned as structured `ApiError` values. Always check `result.ok` before accessing `result.data`.

### Diagnostics

Each diagnostic carries a machine-readable code, a dotted field path, and a severity:

```ts
interface ApiDiagnostic {
  path: string        // e.g. 'profile.age', 'assumptions.returnScenarios[0].id'
  code: string        // e.g. 'INVALID_RANGE', 'UNSUPPORTED_RULE_YEAR'
  severity: 'error' | 'warning'
  message: string
}
```

### Rule year resolution

Most functions accept an optional `ruleYear` parameter. When omitted, the currently active rule year is used (2026). If an unsupported year is requested, the function returns an error with code `UNSUPPORTED_RULE_YEAR`. Discover supported years via `getManifest()`.

### Precision guarantee

All outputs are exact engine values. Statutory rounding (e.g. `floorEuro(zvE)`) is applied inside the engine only where German law requires it. Display rounding is the caller's responsibility.

## API reference

### Manifest

#### `getManifest()`

Returns the full capability surface in a single call: API version, active rule year, product catalog, built-in defaults, comparison capabilities, and the not-advice disclaimer.

```ts
const { data } = getManifest()

data.apiVersion           // 'v1'
data.activeRuleYear       // 2026
data.supportedRuleYears   // [2026]
data.productIds           // ['etf', 'bav', 'insurance', 'basisrente', 'altersvorsorgedepot', 'riester']
data.products             // Full manifest entries with id, label, color, order, ...
data.defaultProfile       // Deep-cloned snapshot of built-in default profile
data.defaultAssumptions   // Deep-cloned snapshot of built-in default assumptions
data.defaultMonthlyNettoBelastungEur  // Default monthly net cost anchor (EUR)
data.comparisonCapabilities.detailLevels      // ['summary', 'standard', 'full']
data.comparisonCapabilities.monteCarloMinRuns // 100
data.comparisonCapabilities.monteCarloMaxRuns // 5000
data.disclaimer.text      // German not-advice disclaimer
```

Use this for feature detection (supported products, rule years, Monte Carlo ceiling) and for seeding default inputs without hardcoding them.

---

### Tax primitives

#### `calculateIncomeTax(request)`

Computes German income tax (Einkommensteuer) for a given taxable income using the statutory 2026 tariff.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. Defaults to active year. |
| `taxableIncome` | `number` | Yes | Non-negative taxable income in EUR. |

**Returns** `ApiResult<IncomeTaxResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `taxableIncome` | `number` | Echo of the input. |
| `incomeTax` | `number` | Computed income tax in EUR. |

```ts
const result = calculateIncomeTax({ taxableIncome: 50_000 })
// result.data.incomeTax → 10987.xx (exact engine value)
```

#### `calculateSolidarity(request)`

Computes the solidarity surcharge (Solidaritaetszuschlag) from a given income tax amount.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `incomeTax` | `number` | Yes | Non-negative income tax in EUR. |
| `filingStatus` | `'single' \| 'married'` | No | Filing status. Defaults to `'single'`. |

**Returns** `ApiResult<SolidarityResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `incomeTax` | `number` | Echo of the input. |
| `filingStatus` | `string` | Effective filing status. |
| `solidarityTax` | `number` | Solidarity surcharge in EUR. |

#### `calculateCapitalGains(request)`

Computes capital gains tax (Abgeltungsteuer) with optional partial exemption (Teilfreistellung) and saver allowance (Sparerpauschbetrag).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `gain` | `number` | Yes | Capital gain in EUR. |
| `partialExemption` | `number` | No | Teilfreistellung ratio, 0-1. Defaults to `0`. |
| `annualAllowance` | `number` | No | Saver allowance in EUR. Defaults from rules. |

**Returns** `ApiResult<CapitalGainsResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `gain` | `number` | Echo of the input. |
| `partialExemption` | `number` | Effective Teilfreistellung. |
| `annualAllowance` | `number` | Effective saver allowance. |
| `capitalGainsTax` | `number` | Computed tax in EUR. |

```ts
const result = calculateCapitalGains({
  gain: 10_000,
  partialExemption: 0.3,  // Equity-fund Teilfreistellung
})
```

---

### Salary / payroll

#### `calculateSalary(request)`

Computes a full annual salary breakdown from a personal profile: gross-to-net, income tax, solidarity surcharge, social contributions, and Vorsorgepauschale.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `profile` | `ApiProfile` | Yes | Personal profile (see [Profile type](#apiprofile)). |

**Returns** `ApiResult<SalaryResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `annualGross` | `number` | Annual gross salary. |
| `annualNet` | `number` | Annual net salary. |
| `annualTaxableIncome` | `number` | zu versteuerndes Einkommen. |
| `annualIncomeTax` | `number` | Income tax. |
| `annualSolidarity` | `number` | Solidarity surcharge. |
| `socialContributions.healthInsurance` | `number` | Annual health insurance contribution. |
| `socialContributions.pensionInsurance` | `number` | Annual pension insurance contribution. |
| `socialContributions.unemploymentInsurance` | `number` | Annual unemployment insurance. |
| `socialContributions.nursingCareInsurance` | `number` | Annual nursing care insurance. |
| `socialContributions.total` | `number` | Total social contributions. |
| `vorsorgepauschale` | `number` | Vorsorgepauschale deduction. |
| `monthlyNet` | `number` | Monthly net salary (annualNet / 12). |
| `pkvEmployerSubsidy` | `number \| undefined` | PKV employer subsidy (only for PKV members). |

---

### Salary-phase funding

These functions compute the funding mechanics (tax savings, allowances, employer contributions) for each retirement product during the savings phase. All require a personal profile and product-specific assumptions.

#### `calculateBavFundingApi(request)`

Computes bAV (betriebliche Altersvorsorge) salary conversion funding including employer subsidy, tax/SV savings, and statutory limits.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `profile` | `ApiProfile` | Yes | Personal profile. |
| `bav` | `ApiBavAssumptions` | Yes | bAV product assumptions. |

**Returns** `ApiResult<BavFundingResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `monthlyGrossConversion` | `number` | Monthly Entgeltumwandlung in EUR. |
| `monthlyNetCost` | `number` | Actual net cost to the employee. |
| `monthlyTaxAndSvSavings` | `number` | Monthly tax and social security savings. |
| `monthlyStatutoryEmployerSubsidy` | `number` | Statutory 15% employer subsidy (effective, after cap). |
| `monthlyStatutoryEmployerSubsidyUncapped` | `number` | Uncapped 15% candidate (annualGrossConversion × 15%). 0 when subsidy is disabled or not applicable for the Durchführungsweg. |
| `monthlyStatutoryEmployerSubsidyCap` | `number` | Employer social-security savings that form the subsidy cap. 0 when salary is already above the SV BBG. |
| `monthlyStatutoryEmployerSubsidyCapApplied` | `boolean` | `true` when the uncapped value exceeded the cap and was reduced. |
| `monthlyContractualEmployerContribution` | `number` | Additional contractual employer match. |
| `monthlyEmployerContribution` | `number` | Total employer contribution. |
| `estimatedMonthlyGrvReduction` | `number` | Estimated GRV pension reduction. |
| `taxFreePortionAnnual` | `number` | Tax-free portion under ss3 Nr. 63 EStG. |
| `svFreePortionAnnual` | `number` | SV-free portion under ss1 SvEV. |
| `taxableOverflowAnnual` | `number` | Amount exceeding tax-free cap. |

#### `solveBavGrossFromNetApi(request)`

Reverse-solves the monthly gross conversion needed to achieve a target monthly net cost.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `profile` | `ApiProfile` | Yes | Personal profile. |
| `bav` | `ApiBavAssumptions` | Yes | bAV product assumptions. |
| `targetMonthlyNet` | `number` | Yes | Desired monthly net cost (must be > 0). |

**Returns** `ApiResult<BavSolveResponse>` with `monthlyGrossConversion` and echo of `targetMonthlyNet`.

#### `calculateBasisrenteFundingApi(request)`

Computes Basisrente (Ruerup) funding: tax savings via ss10 Abs. 3 EStG Sonderausgabenabzug and remaining Schicht-1 cap.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `profile` | `ApiProfile` | Yes | Personal profile. |
| `basisrente` | `ApiBasisrenteAssumptions` | Yes | Basisrente assumptions. |

**Returns** `ApiResult<BasisrenteFundingResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `monthlyGrossContribution` | `number` | Monthly gross contribution. |
| `monthlyNetCost` | `number` | Monthly net cost after tax savings. |
| `annualTaxSaving` | `number` | Annual tax saving from Sonderausgaben. |
| `annualDeductible` | `number` | Deductible amount under ss10 Abs. 3. |
| `remainingSchicht1Cap` | `number` | Remaining Schicht-1 cap. |

#### `calculateAvdFundingApi(request)`

Computes Altersvorsorgedepot (AVD) funding: allowances (Grundzulage, Kinderzulage, career-starter bonus) and Guenstigerpruefung benefit.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `profile` | `ApiProfile` | Yes | Personal profile. |
| `altersvorsorgedepot` | `ApiAltersvorsorgedepotAssumptions` | Yes | AVD assumptions. |

**Returns** `ApiResult<AvdFundingResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `monthlyOwnContribution` | `number` | Monthly own contribution. |
| `monthlyNetCost` | `number` | Monthly net cost. |
| `totalAllowanceAnnual` | `number` | Total annual allowance. |
| `basicAllowanceAnnual` | `number` | Annual Grundzulage. |
| `childAllowanceAnnual` | `number` | Annual Kinderzulage. |
| `careerStarterBonusAnnual` | `number` | Annual career-starter bonus. |
| `guenstigerpruefungBenefitAnnual` | `number` | Annual Guenstigerpruefung tax benefit. |
| `cappedAtContractMax` | `boolean` | Whether contribution was capped. |

#### `calculateRiesterFundingApi(request)`

Computes Riester funding: Grundzulage, Kinderzulage, minimum contribution check, and Guenstigerpruefung benefit.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `profile` | `ApiProfile` | Yes | Personal profile. |
| `riester` | `ApiRiesterAssumptions` | Yes | Riester assumptions. |

**Returns** `ApiResult<RiesterFundingResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `monthlyOwnContribution` | `number` | Monthly own contribution. |
| `monthlyNetCost` | `number` | Monthly net cost. |
| `grundzulageAnnual` | `number` | Annual Grundzulage. |
| `childAllowanceAnnual` | `number` | Annual Kinderzulage. |
| `totalAllowanceAnnual` | `number` | Total annual allowance. |
| `meetsMinContribution` | `boolean` | Whether minimum contribution is met. |
| `guenstigerpruefungBenefitAnnual` | `number` | Annual Guenstigerpruefung benefit. |

---

### Retirement-phase tax

#### `calculateRetirementTaxApi(request)`

Runs the full retirement-tax pipeline: cohort-based taxation (Besteuerungsanteil, Versorgungsfreibetrag), deductions (Werbungskosten, Sonderausgaben), income tax, solidarity surcharge, and Abgeltungsteuer on private insurance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `components` | `ApiRetirementIncomeComponents` | Yes | Income breakdown (see [type reference](#apiretirementincomecomponents)). |
| `filingStatus` | `'single' \| 'married'` | No | Filing status. Defaults to `'single'`. |

**Returns** `ApiResult<RetirementTaxResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `statutoryPensionTaxable` | `number` | Taxable portion of statutory pension. |
| `bavPensionTaxable` | `number` | Taxable bAV pension. |
| `privateInsuranceTaxable` | `number` | Taxable private insurance income. |
| `otherTaxable` | `number` | Other taxable income. |
| `werbungskostenVersorgung` | `number` | Deduction for Versorgungsbezuege. |
| `werbungskostenRenten` | `number` | Deduction for Renten. |
| `sonderausgaben` | `number` | Sonderausgaben-Pauschbetrag. |
| `zuVersteuerndesEinkommen` | `number` | Taxable income (zvE). |
| `einkommensteuer` | `number` | Income tax. |
| `solidaritaetszuschlag` | `number` | Solidarity surcharge. |
| `abgeltungsteuerOnPrivateInsurance` | `number` | Abgeltungsteuer on private insurance. |
| `totalTaxAnnual` | `number` | Total annual tax burden. |
| `netRetirementIncomeAnnual` | `number` | Net annual retirement income. |

```ts
const result = calculateRetirementTaxApi({
  components: {
    retirementYear: 2059,
    statutoryPensionAnnual: 18_000,
    bavPensionAnnual: 6_000,
    bavIsLumpSum: false,
    privateInsuranceTaxableAnnual: 0,
    privateInsuranceTaxMode: 'halbeinkuenfte',
    otherTaxableAnnual: 0,
  },
})
```

#### `calculateRetirementKvPvApi(request)`

Computes retirement-phase health insurance (KV) and nursing care insurance (PV) contributions with proportional apportionment over the BBG (Beitragsbemessungsgrenze).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `context` | `ApiRetirementKvPvContext` | Yes | KV/PV context (see [type reference](#apiretirementkvpvcontext)). |

**Returns** `ApiResult<RetirementKvPvResponse>` with per-source KV/PV breakdowns, totals, and uncapped values.

#### `deriveInsuranceTaxModeApi(request)`

Derives the tax mode for private insurance payouts based on contract parameters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contractStartYear` | `number` | Yes | Year the contract started. |
| `contractRuntimeYears` | `number` | Yes | Number of years the contract runs. |
| `retirementAge` | `number` | Yes | Age at retirement. |
| `oldContractTaxFreeEligible` | `boolean` | No | Pre-2005 tax-free eligibility. |

**Returns** `ApiResult<InsuranceTaxModeResponse>` with `taxMode` (`'pre2005'`, `'halbeinkuenfte'`, or `'abgeltungsteuer'`).

#### `deriveBavLumpSumTaxModeApi(request)`

Derives the lump-sum tax mode for bAV payouts based on the Durchfuehrungsweg.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `durchfuehrungsweg` | `string` | Yes | bAV implementation path (e.g. `'direktversicherung'`). |
| `pre2005EligibleTaxFree` | `boolean` | No | Pre-2005 tax-free eligibility. Defaults to `false`. |

**Returns** `ApiResult<BavLumpSumTaxModeResponse>` with `taxMode`.

---

### Comparison simulation

#### `runComparison(request)`

Top-level facade: runs a full retirement-product comparison and returns structured results. This mirrors the UI simulation pipeline so downstream consumers get identical numbers without depending on React.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ruleYear` | `number` | No | Rule year to use. |
| `profile` | `Partial<ApiProfile>` | No | Personal profile overrides. Merged with defaults. |
| `assumptions` | `Partial<ApiAssumptions>` | No | Scenario assumption overrides. Merged with defaults. |
| `selectedScenarioId` | `string` | No | Active return scenario. Defaults to `'basis'`. |
| `monthlyNettoBelastungEur` | `number` | No | Monthly net cost anchor in EUR. |
| `detailLevel` | `'summary' \| 'standard' \| 'full'` | No | Controls response payload size. Defaults to `'summary'`. |
| `includeMonteCarlo` | `boolean` | No | Include Monte Carlo simulation. Defaults to `false`. |

**Detail levels**:

| Level | Includes |
|-------|----------|
| `summary` | Selected results, statutory pension, funding summaries, best capital/pension, tax diagnostics. |
| `standard` | Everything in summary + `allScenarioResults` (all scenarios, not just selected). |
| `full` | Everything in standard + `yearlyRows` (per-product accumulation) + `etfPayoutRows` + Monte Carlo `yearlyBands`. |

**Returns** `ApiResult<ComparisonResponse>`:

| Field | Type | Description |
|-------|------|-------------|
| `detailLevel` | `string` | Effective detail level. |
| `effectiveScenarioId` | `string` | Resolved scenario ID. |
| `effectiveMonthlyNettoBelastungEur` | `number` | Effective net cost anchor. |
| `productManifest` | `ApiProductManifestEntry[]` | Product catalog snapshot. |
| `statutoryPension` | `StatutoryPensionSummary` | GRV baseline: gross and net monthly. |
| `fundingSummaries` | `FundingSummaries` | Per-product funding breakdown. |
| `selectedResults` | `ProductResultSummary[]` | Results for visible products in the selected scenario. |
| `bestCapital` | `ProductResultSummary \| null` | Product with highest capital at retirement. |
| `bestPension` | `ProductResultSummary \| null` | Product with highest net monthly payout. |
| `taxDiagnostics` | `TaxDiagnostics` | Derived tax modes and KVdR status. |
| `allScenarioResults` | `ProductResultSummary[]` | (standard/full) All scenario results. |
| `yearlyRows` | `YearlyRowEntry[]` | (full) Yearly accumulation projections. |
| `etfPayoutRows` | `EtfPayoutRowEntry[]` | (full) ETF payout schedule. |
| `monteCarlo` | `MonteCarloSummaryResponse \| null` | Monte Carlo results (when requested). |

```ts
// Minimal — uses all defaults
const result = runComparison({})

// Custom profile + specific products + Monte Carlo
const result = runComparison({
  profile: { age: 35, retirementAge: 67, grossSalaryYear: 75_000 },
  assumptions: { visibleProducts: ['etf', 'bav', 'basisrente'] },
  monthlyNettoBelastungEur: 400,
  selectedScenarioId: 'konservativ',
  detailLevel: 'full',
  includeMonteCarlo: true,
})
```

---

### Validation

Four standalone validators are exported for pre-flight input checking. Each returns an array of `ApiDiagnostic` — empty means valid.

| Function | Validates |
|----------|-----------|
| `validateProfile(profile)` | `ApiProfile` shape and field ranges. |
| `validateSharedAssumptions(assumptions)` | Shared fields: `visibleProducts`, `returnScenarios`, `retirementEndAge`, `inflationRate`, `monteCarlo`. |
| `validateProductAssumptions(assumptions)` | Per-product assumptions via the product registry's built-in validators. |
| `validateComparisonRequest({ profile, assumptions, ruleYear })` | Orchestrates all three validators + rule year check. |

---

## Type reference

### `ApiProfile`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `age` | `number` | Yes | Current age (18-99). |
| `retirementAge` | `number` | Yes | Retirement age (> age, <= 100). |
| `grossSalaryYear` | `number` | Yes | Annual gross salary in EUR (>= 0). |
| `taxClass` | `1` | Yes | Tax class (only class 1 supported). |
| `childBirthYears` | `number[]` | Yes | Birth years of children (1900-2200). |
| `churchTax` | `boolean` | Yes | Church tax liability. |
| `publicHealthInsurance` | `boolean` | Yes | `true` = GKV, `false` = PKV. |
| `healthAdditionalContributionPct` | `number` | Yes | Additional health contribution % (0-10). |
| `pkvMonthlyPremium` | `number` | Yes | Monthly PKV premium (>= 0, relevant for PKV). |
| `pPVMonthlyPremium` | `number` | Yes | Monthly private PV premium (>= 0, relevant for PKV). |
| `desiredNetMonthlyPension` | `number` | No | Desired net monthly pension in EUR. |

### `ApiRetirementIncomeComponents`

| Field | Type | Description |
|-------|------|-------------|
| `statutoryPensionAnnual` | `number` | Annual statutory pension income. |
| `bavPensionAnnual` | `number` | Annual bAV pension income. |
| `bavIsLumpSum` | `boolean` | Whether bAV payout is a lump sum. |
| `privateInsuranceTaxableAnnual` | `number` | Annual taxable private insurance income. |
| `privateInsuranceTaxMode` | `string` | Tax mode: `'pre2005'`, `'halbeinkuenfte'`, or `'abgeltungsteuer'`. |
| `privateInsuranceContributions` | `Array<{ amount, mode }>` | Optional contribution breakdown. |
| `otherTaxableAnnual` | `number` | Other taxable retirement income. |
| `retirementYear` | `number` | Year of retirement (for cohort-based taxation). |

### `ApiRetirementKvPvContext`

| Field | Type | Description |
|-------|------|-------------|
| `bavMonthlyVersorgungsbezuege` | `number` | Monthly bAV Versorgungsbezuege. |
| `otherMonthlyVersorgungsbezuege` | `number` | Other monthly Versorgungsbezuege. |
| `monthlyStatutoryPension` | `number` | Monthly statutory pension. |
| `freiwilligOtherMonthlyIncome` | `number` | Other monthly income (for freiwillig GKV). |
| `isFreiwilligVersichert` | `boolean` | freiwillig vs. KVdR. |
| `kvFreibetragVersorgungMonthly` | `number` | KV Freibetrag for Versorgungsbezuege. |
| `pvFreigrenzeVersorgungMonthly` | `number` | PV Freigrenze for Versorgungsbezuege. |
| `monthlyKvPvBbg` | `number` | Monthly KV/PV BBG. |
| `healthRate` | `number` | Combined KV rate (employer + employee share + Zusatzbeitrag). |
| `careRate` | `number` | PV contribution rate. |

### `ProductResultSummary`

| Field | Type | Description |
|-------|------|-------------|
| `productId` | `string` | Product identifier. |
| `instanceId` | `string \| undefined` | Instance ID (combine-mode only). |
| `scenarioId` | `string` | Return scenario used. |
| `label` | `string` | Display label. |
| `monthlyUserCost` | `number` | Monthly net cost to the user. |
| `capitalAtRetirement` | `number` | Nominal capital at retirement. |
| `realCapitalAtRetirement` | `number` | Inflation-adjusted capital. |
| `afterTaxLumpSum` | `number \| null` | After-tax lump sum (`null` if not available, e.g. Basisrente). |
| `grossMonthlyPayout` | `number` | Gross monthly payout. |
| `netMonthlyPayout` | `number` | Net monthly payout after tax and KV/PV. |
| `taxAndSvSavings` | `number` | Accumulated tax/SV savings during savings phase. |
| `accumulationRiy` | `number` | Reduction in yield (decimal, e.g. 0.012 = 1.2% p.a.). |
| `totalUserCost` | `number` | Total user cost over accumulation phase. |
| `totalFees` | `number` | Total fees over accumulation phase. |

---

## Error codes

| Code | Description |
|------|-------------|
| `INVALID_TYPE` | Field has wrong type (e.g. string where number expected). |
| `INVALID_VALUE` | Field has an invalid value (e.g. unsupported tax class). |
| `INVALID_RANGE` | Numeric field is out of allowed range. |
| `INVALID_INPUT` | General input validation failure. |
| `UNSUPPORTED_RULE_YEAR` | Requested rule year is not compiled into the bundle. |
| `UNKNOWN_PRODUCT_ID` | Product ID not in the registry. |
| `UNKNOWN_SCENARIO_ID` | Return scenario ID not recognized. |
| `DUPLICATE_SCENARIO_ID` | Same scenario ID appears more than once. |
| `TOO_MANY_SCENARIOS` | More than 10 return scenarios provided. |
| `PRODUCT_VALIDATION_FAILED` | Product-specific assumptions failed the registry validator. |
| `ENGINE_ERROR` | Unexpected engine exception caught by the safety net. |
| `COMPUTATION_NAN` | Engine produced NaN in an output field. |

---

## Concurrency and safety

All API functions are:
- **Pure**: no side effects, no mutation of shared state (manifests and defaults are deep-cloned before returning).
- **Synchronous**: no promises, no callbacks.
- **Thread-safe**: safe to call from web workers or concurrent contexts.
- **Idempotent**: same inputs always produce the same outputs.

---

## Module map

| File | Purpose |
|------|---------|
| [`index.ts`](index.ts) | Public barrel — all exports go through here. |
| [`contracts.ts`](contracts.ts) | `ApiResult<T>` envelope, `ApiDiagnostic`, safety helpers (`safeEngineCall`, `findNaN`). |
| [`apiTypes.ts`](apiTypes.ts) | API-owned input/output types (decoupled from domain). |
| [`manifest.ts`](manifest.ts) | `getManifest()` — capability discovery. |
| [`rules.ts`](rules.ts) | `resolveRuleYear()` — maps optional year to `GermanRules`. |
| [`validation.ts`](validation.ts) | Input validators for profile, assumptions, products. |
| [`tax.ts`](tax.ts) | `calculateIncomeTax`, `calculateSolidarity`, `calculateCapitalGains`, `calculateSalary`. |
| [`funding.ts`](funding.ts) | `calculateBavFundingApi`, `solveBavGrossFromNetApi`, `calculateBasisrenteFundingApi`, `calculateAvdFundingApi`, `calculateRiesterFundingApi`. |
| [`retirement.ts`](retirement.ts) | `calculateRetirementTaxApi`, `calculateRetirementKvPvApi`, `deriveInsuranceTaxModeApi`, `deriveBavLumpSumTaxModeApi`. |
| [`comparison.ts`](comparison.ts) | `runComparison` — full comparison simulation facade. |
| [`resultSummaries.ts`](resultSummaries.ts) | DTO mapping helpers (engine types to API types). |
| [`api.examples.test.ts`](api.examples.test.ts) | Executable usage examples (Vitest). |
