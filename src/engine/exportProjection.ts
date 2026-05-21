/**
 * Export projection layer — single source of product-aware row values for
 * CSV / PDF exports (#209).
 *
 * Before this module: `src/utils/csvExport.ts` re-implemented per-product
 * tax-path selection inline at L107-150 (compare-mode yearly cashflows),
 * L321-360 (combine-mode per-instance cashflows), and L177 / L391 (ETF
 * payout filtering). Adding a new product required N edit sites.
 *
 * After: each CSV / PDF surface consumes `ExportSummaryRow[]` /
 * `ExportYearlyRow[]` / `ExportEtfPayoutRow[]` produced by the builders
 * below. Product-id branching happens once, inside
 * `dispatchAfterTaxBalance`, via an exhaustive switch on `ProductId`.
 *
 * The projection is engine-adjacent (framework-free). It does NOT round
 * — CSV `n()` / `nn()` formatters and `formatCurrency` own display rounding
 * (CLAUDE.md UI-rounding boundary). All numbers carry full precision.
 *
 * Retirement-tax invariant: combine-mode `netMonthlyPayout` is read from
 * `CombinedResult.byInstance[instanceId].monthlyNet` (the back-allocated
 * value from the aggregate `calculateRetirementTax` + `calculateRetirementKvPv`
 * pipeline), falling back to per-instance `r.netMonthlyPayout` only when
 * the aggregate pipeline has no entry. Per CLAUDE.md, all retirement-phase
 * taxable income must route through `calculateRetirementTax`.
 */

import type {
  BavLumpSumTaxMode,
  EtfPayoutRow,
  EtfProductResult,
  EvidenceState,
  GermanRules,
  InsuranceTaxMode,
  PersonalProfile,
  ProductId,
  ProductResult,
  YearlyProjection,
} from '../domain'
import { afterTaxBavLumpSum } from './bavPayout'
import { afterTaxCertifiedPensionLumpSum } from './certifiedPensionPayout'
import { afterTaxInvestmentCapital } from './etfPayout'
import { afterTaxInsuranceLumpSum } from './insurancePayout'
import type { CombinedResult } from './portfolioCombine'

// ---------------------------------------------------------------------------
// Row types (sectioned: summary / yearly / ETF payout)
// ---------------------------------------------------------------------------

/**
 * Section 1 (compare-mode "Detailvergleich") / Section 2 (combine-mode
 * "Mein Plan — Detail je Instanz") — one row per product × scenario, or
 * per instance × scenario in combine.
 *
 * Carries full-precision floats; CSV / PDF surfaces format on output.
 */
export interface ExportSummaryRow {
  /** Combine-mode: source instance id. Compare-mode: undefined. */
  readonly instanceId?: string
  readonly productId: ProductId
  readonly label: string
  readonly scenarioId: string
  readonly scenarioLabel: string
  readonly monthlyUserCost: number
  readonly monthlyProductContribution: number
  readonly capitalAtRetirement: number
  /** Basisrente → null (capital payout legally prohibited, §10 Abs. 1 Nr. 2 EStG). */
  readonly afterTaxLumpSum: number | null
  /** Gross monthly payout; rendered in combine-mode Section 2 only. */
  readonly grossMonthlyPayout: number
  /**
   * Combine-mode: `combinedByScenarioId[scenarioId].byInstance[instanceId].monthlyNet`
   * from the aggregate retirement-tax pipeline (falls back to
   * `r.netMonthlyPayout` only when the aggregate has no entry).
   * Compare-mode: `r.netMonthlyPayout` from the per-product simulator.
   */
  readonly netMonthlyPayout: number
  readonly totalFees: number
  readonly valueMultipleOnUserCost: number | null
  /** May be undefined on legacy compare-mode results (no instance metadata). */
  readonly inputConfidence: EvidenceState | undefined
}

/**
 * Section 2 (compare-mode "Jahres-Cashflows") / Section 3 (combine-mode
 * "Jahres-Cashflows je Instanz") — one row per product × scenario × year,
 * or per instance × scenario × year in combine.
 */
export interface ExportYearlyRow {
  /** Combine-mode: source instance id. Compare-mode: undefined. */
  readonly instanceId?: string
  readonly productId: ProductId
  readonly label: string
  readonly scenarioId: string
  readonly scenarioLabel: string
  readonly age: number
  readonly yearlyUserCost: number
  readonly yearlyProductContribution: number
  readonly yearlyEmployerContribution: number
  /**
   * bAV-only Steuer-/SV-Ersparnis (EUR/year). 0 for other products in
   * compare-mode; null in combine-mode (column not exported there).
   */
  readonly annualTaxSvSavings: number | null
  readonly yearlyFees: number
  readonly cumulativeFees: number
  readonly balance: number
  /**
   * After-tax capital at this row's age. Null when:
   *   - product is Basisrente (capital payout legally prohibited), OR
   *   - combine-mode and per-instance tax modes are missing for this instance.
   */
  readonly afterTaxBalance: number | null
  readonly realBalance: number
  /** Real (inflation-adjusted) after-tax balance. Null when `afterTaxBalance` is null. */
  readonly realAfterTaxBalance: number | null
}

/**
 * Section 3 (compare-mode "Rentenphase (ETF-Entnahme)") / Section 4 (combine-mode
 * "Rentenphase (ETF-Entnahme) je ETF-Instanz") — one row per ETF instance ×
 * scenario × payout year.
 */
export interface ExportEtfPayoutRow {
  /** Combine-mode: source instance id. Compare-mode: undefined. */
  readonly instanceId?: string
  /** ETF product id. */
  readonly productId: ProductId
  readonly label: string
  readonly scenarioId: string
  readonly scenarioLabel: string
  readonly age: number
  readonly capitalAtStart: number
  readonly grossAnnualPayout: number
  readonly taxableGain: number
  readonly saverAllowanceUsed: number
  readonly taxDue: number
  readonly netMonthlyPayout: number
  readonly capitalAtEnd: number
}

// ---------------------------------------------------------------------------
// Per-instance tax-mode bundle (moved from csvExport.ts)
// ---------------------------------------------------------------------------

/**
 * Per-instance tax-mode bundle for combine-mode after-tax column derivation.
 *
 * Built by `src/app/combineCsvWiring.ts` from the workspace assumptions and
 * passed into `buildCombineExportProjection`. When absent (or missing for a
 * given instance), after-tax columns are emitted as `null` rather than
 * throwing.
 */
export interface InstanceTaxModes {
  /** bAV lump-sum income-tax routing (derived by `deriveBavLumpSumTaxMode`). */
  bavTaxMode?: BavLumpSumTaxMode
  /** Private-insurance capital-payout tax era (derived by `deriveInsuranceTaxMode`). */
  insuranceTaxMode?: InsuranceTaxMode
  /** ETF equity partial exemption ratio (e.g. 0.3 for equity funds). */
  equityPartialExemption?: number
  /** Other annual retirement income for AVD §22 Nr. 5 marginal-tax calc. Defaults to 0. */
  avdOtherAnnualIncome?: number
  /** Other annual retirement income for Riester §22 Nr. 5 marginal-tax calc. Defaults to 0. */
  riesterOtherAnnualIncome?: number
}

// ---------------------------------------------------------------------------
// Compare-mode projection
// ---------------------------------------------------------------------------

export interface BuildCompareProjectionOptions {
  readonly products: ProductResult[]
  readonly bavAnnualTaxSvSavings: number
  readonly bavProfile: PersonalProfile
  readonly bavKvdrMember: boolean
  readonly bavOtherAnnualIncome: number
  readonly insuranceTaxMode: InsuranceTaxMode
  readonly equityPartialExemption: number
  readonly insuranceOtherAnnualIncome: number
  /**
   * Other annual retirement income used in the §22 Nr. 5 marginal-tax calc for
   * AVD capital lump-sum rows. Corresponds to
   * `altersvorsorgedepot.monthlyOtherRetirementIncome * 12`. Defaults to 0.
   */
  readonly avdOtherAnnualIncome?: number
  /**
   * Other annual retirement income used in the §22 Nr. 5 marginal-tax calc for
   * Riester capital lump-sum rows. Corresponds to
   * `riester.monthlyOtherRetirementIncome * 12`. Defaults to 0.
   */
  readonly riesterOtherAnnualIncome?: number
  readonly rules: GermanRules
}

export interface CompareExportProjection {
  readonly summary: ReadonlyArray<ExportSummaryRow>
  readonly yearly: ReadonlyArray<ExportYearlyRow>
  readonly etfPayouts: ReadonlyArray<ExportEtfPayoutRow>
}

export function buildCompareExportProjection(
  opts: BuildCompareProjectionOptions,
): CompareExportProjection {
  const summary: ExportSummaryRow[] = []
  const yearly: ExportYearlyRow[] = []
  const etfPayouts: ExportEtfPayoutRow[] = []

  for (const r of opts.products) {
    summary.push({
      productId: r.productId,
      label: r.label,
      scenarioId: r.scenarioId,
      scenarioLabel: r.scenarioLabel,
      monthlyUserCost: r.monthlyUserCost,
      monthlyProductContribution: r.monthlyProductContribution,
      capitalAtRetirement: r.capitalAtRetirement,
      afterTaxLumpSum: r.afterTaxLumpSum,
      grossMonthlyPayout: r.grossMonthlyPayout,
      netMonthlyPayout: r.netMonthlyPayout,
      totalFees: r.totalFees,
      valueMultipleOnUserCost: r.valueMultipleOnUserCost,
      inputConfidence: r.inputConfidence,
    })

    const annualSavings = r.productId === 'bav' ? opts.bavAnnualTaxSvSavings : 0
    for (const row of r.rows) {
      const afterTax = dispatchAfterTaxBalanceCompare(r.productId, row, opts)
      const realAfterTax =
        afterTax !== null && row.balance > 0
          ? afterTax * (row.realBalance / row.balance)
          : null
      yearly.push({
        productId: r.productId,
        label: r.label,
        scenarioId: r.scenarioId,
        scenarioLabel: r.scenarioLabel,
        age: row.age,
        yearlyUserCost: row.yearlyUserCost,
        yearlyProductContribution: row.yearlyProductContribution,
        yearlyEmployerContribution: row.yearlyEmployerContribution,
        annualTaxSvSavings: annualSavings,
        yearlyFees: row.yearlyFees,
        cumulativeFees: row.cumulativeFees,
        balance: row.balance,
        afterTaxBalance: afterTax,
        realBalance: row.realBalance,
        realAfterTaxBalance: realAfterTax,
      })
    }

    if (isEtfWithPayouts(r)) {
      for (const payoutRow of r.etfPayoutRows) {
        etfPayouts.push(toExportEtfPayoutRow(r, payoutRow, undefined))
      }
    }
  }

  return { summary, yearly, etfPayouts }
}

// ---------------------------------------------------------------------------
// Combine-mode projection
// ---------------------------------------------------------------------------

export interface BuildCombineProjectionOptions {
  /** Per-instance ProductResults keyed by instanceId, all scenarios. */
  readonly perInstance: Record<string, ProductResult[]>
  /** CombinedResult per scenario id. */
  readonly combinedByScenarioId: Record<string, CombinedResult>
  /** Scenario labels keyed by id. */
  readonly scenarioLabels: Record<string, string>
  /**
   * Per-instance tax modes for yearly after-tax columns. When absent (or
   * missing for an instance), `afterTaxBalance` is emitted as null rather
   * than throwing.
   */
  readonly perInstanceTaxModes?: Record<string, InstanceTaxModes>
  /** Shared rules. After-tax columns require this to be present. */
  readonly rules?: GermanRules
  /** Shared personal profile (used by bAV lump-sum KV/PV helper). */
  readonly profile?: PersonalProfile
}

export interface CombineExportProjection {
  readonly summary: ReadonlyArray<ExportSummaryRow>
  readonly yearly: ReadonlyArray<ExportYearlyRow>
  readonly etfPayouts: ReadonlyArray<ExportEtfPayoutRow>
}

export function buildCombineExportProjection(
  opts: BuildCombineProjectionOptions,
): CombineExportProjection {
  const summary: ExportSummaryRow[] = []
  const yearly: ExportYearlyRow[] = []
  const etfPayouts: ExportEtfPayoutRow[] = []

  // Sort by instanceId for stable output (matches buildCombinePortfolioCsv).
  const ids = Object.keys(opts.perInstance).sort()
  for (const instanceId of ids) {
    const results = opts.perInstance[instanceId]
    if (!results) continue
    const taxModes = opts.perInstanceTaxModes?.[instanceId]

    for (const r of results) {
      // Use the back-allocated monthlyNet from the aggregate progressive
      // tax + KV/PV pipeline (byInstance) so this column matches the
      // CombineDetailView for multi-product households. Falls back to the
      // per-instance simulator value only when byInstance has no entry.
      const combinedForScenario = opts.combinedByScenarioId[r.scenarioId]
      const netMonthly =
        combinedForScenario?.byInstance[instanceId]?.monthlyNet ??
        r.netMonthlyPayout

      summary.push({
        instanceId,
        productId: r.productId,
        label: r.label,
        scenarioId: r.scenarioId,
        scenarioLabel: r.scenarioLabel,
        monthlyUserCost: r.monthlyUserCost,
        monthlyProductContribution: r.monthlyProductContribution,
        capitalAtRetirement: r.capitalAtRetirement,
        afterTaxLumpSum: r.afterTaxLumpSum,
        grossMonthlyPayout: r.grossMonthlyPayout,
        netMonthlyPayout: netMonthly,
        totalFees: r.totalFees,
        valueMultipleOnUserCost: r.valueMultipleOnUserCost,
        inputConfidence: r.inputConfidence,
      })

      for (const row of r.rows) {
        const afterTax = dispatchAfterTaxBalanceCombine(
          r.productId,
          row,
          taxModes,
          opts.rules,
          opts.profile,
        )
        const realAfterTax =
          afterTax !== null && row.balance > 0
            ? afterTax * (row.realBalance / row.balance)
            : null
        yearly.push({
          instanceId,
          productId: r.productId,
          label: r.label,
          scenarioId: r.scenarioId,
          scenarioLabel: r.scenarioLabel,
          age: row.age,
          yearlyUserCost: row.yearlyUserCost,
          yearlyProductContribution: row.yearlyProductContribution,
          yearlyEmployerContribution: row.yearlyEmployerContribution,
          // Combine-mode does not emit Steuer-/SV-Ersparnis (the bAV salary-
          // phase delta is workspace-aggregate, not per-instance). Null
          // signals to consumers "this column is not present in combine".
          annualTaxSvSavings: null,
          yearlyFees: row.yearlyFees,
          cumulativeFees: row.cumulativeFees,
          balance: row.balance,
          afterTaxBalance: afterTax,
          realBalance: row.realBalance,
          realAfterTaxBalance: realAfterTax,
        })
      }

      if (isEtfWithPayouts(r)) {
        for (const payoutRow of r.etfPayoutRows) {
          etfPayouts.push(toExportEtfPayoutRow(r, payoutRow, instanceId))
        }
      }
    }
  }

  return { summary, yearly, etfPayouts }
}

// ---------------------------------------------------------------------------
// Private dispatch helpers
// ---------------------------------------------------------------------------

/**
 * Compare-mode after-tax balance dispatch. Single point of product-id
 * branching for this projection. Exhaustive switch with `const _: never`
 * default — adding a new product to `PRODUCT_REGISTRY` is caught at compile
 * time.
 */
function dispatchAfterTaxBalanceCompare(
  productId: ProductId,
  row: YearlyProjection,
  opts: BuildCompareProjectionOptions,
): number | null {
  switch (productId) {
    case 'bav':
      return afterTaxBavLumpSum(
        row.balance,
        opts.bavProfile,
        opts.rules,
        opts.bavOtherAnnualIncome,
        opts.bavKvdrMember,
      )
    case 'etf':
      return afterTaxInvestmentCapital(
        row.balance,
        row.cumulativeProductContributions,
        opts.rules,
        opts.equityPartialExemption,
        row.cumulativeVorabpauschale,
      )
    case 'basisrente':
      // Capital payout legally prohibited (§10 Abs. 1 Nr. 2 EStG).
      return null
    case 'altersvorsorgedepot':
      return afterTaxCertifiedPensionLumpSum(
        row.balance,
        opts.rules,
        opts.avdOtherAnnualIncome ?? 0,
      )
    case 'riester':
      return afterTaxCertifiedPensionLumpSum(
        row.balance,
        opts.rules,
        opts.riesterOtherAnnualIncome ?? 0,
      )
    case 'versicherung':
      return afterTaxInsuranceLumpSum(
        row.balance,
        row.cumulativeProductContributions,
        opts.insuranceTaxMode,
        opts.rules,
        opts.insuranceOtherAnnualIncome,
      )
    default: {
      // Exhaustiveness guard: if a new product is added to PRODUCT_REGISTRY
      // without extending this switch, the assignment below fails at compile
      // time (tsc -b, surfaced by `npm run verify`).
      const _exhaustive: never = productId
      return _exhaustive
    }
  }
}

/**
 * Combine-mode after-tax balance dispatch. Distinct from compare-mode
 * because combine reads tax modes from a per-instance bundle and only
 * applies after-tax when `rules` is supplied (parity with the existing
 * `buildCombinePortfolioCsv` Section-3 guard).
 */
function dispatchAfterTaxBalanceCombine(
  productId: ProductId,
  row: YearlyProjection,
  taxModes: InstanceTaxModes | undefined,
  rules: GermanRules | undefined,
  profile: PersonalProfile | undefined,
): number | null {
  // Preserve the existing combine-mode guard: when rules or per-instance
  // tax modes are missing, emit null rather than throwing.
  if (!rules || !taxModes) return null

  switch (productId) {
    case 'bav':
      if (!profile) return null
      // otherAnnualIncome=0 and kvdrMember=true mirror the pre-PR-12 buildCombinePortfolioCsv
      // behavior; surfacing them on InstanceTaxModes is a separate concern (combine-mode CSV
      // byte parity is a hard constraint for this PR).
      return afterTaxBavLumpSum(
        row.balance,
        profile,
        rules,
        0,
        true,
        rules.year,
        taxModes.bavTaxMode ?? 'voll_versorgungsbezug',
      )
    case 'etf':
      return afterTaxInvestmentCapital(
        row.balance,
        row.cumulativeProductContributions,
        rules,
        taxModes.equityPartialExemption ?? 0,
        row.cumulativeVorabpauschale,
      )
    case 'basisrente':
      // Capital payout legally prohibited (§10 Abs. 1 Nr. 2 EStG).
      return null
    case 'altersvorsorgedepot':
      return afterTaxCertifiedPensionLumpSum(
        row.balance,
        rules,
        taxModes.avdOtherAnnualIncome ?? 0,
      )
    case 'riester':
      return afterTaxCertifiedPensionLumpSum(
        row.balance,
        rules,
        taxModes.riesterOtherAnnualIncome ?? 0,
      )
    case 'versicherung':
      if (!taxModes.insuranceTaxMode) return null
      return afterTaxInsuranceLumpSum(
        row.balance,
        row.cumulativeProductContributions,
        taxModes.insuranceTaxMode,
        rules,
        0,
      )
    default: {
      const _exhaustive: never = productId
      return _exhaustive
    }
  }
}

function isEtfWithPayouts(r: ProductResult): r is EtfProductResult {
  return r.productId === 'etf' && (r as EtfProductResult).etfPayoutRows.length > 0
}

function toExportEtfPayoutRow(
  r: EtfProductResult,
  payoutRow: EtfPayoutRow,
  instanceId: string | undefined,
): ExportEtfPayoutRow {
  return {
    instanceId,
    productId: r.productId,
    label: r.label,
    scenarioId: r.scenarioId,
    scenarioLabel: r.scenarioLabel,
    age: payoutRow.age,
    capitalAtStart: payoutRow.capitalAtStart,
    grossAnnualPayout: payoutRow.grossAnnualPayout,
    taxableGain: payoutRow.taxableGain,
    saverAllowanceUsed: payoutRow.saverAllowanceUsed,
    taxDue: payoutRow.taxDue,
    netMonthlyPayout: payoutRow.netMonthlyPayout,
    capitalAtEnd: payoutRow.capitalAtEnd,
  }
}
