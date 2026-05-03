import type {
  AltersvorsorgedepotFundingResult,
  BasisrenteFundingResult,
  BavFundingResult,
  BavLumpSumTaxMode,
  GermanRules,
  PersonalProfile,
  RiesterFundingResult,
  ScenarioAssumptions,
  StatutoryPensionResult,
} from '../domain'
import { calculateBasisrenteFunding } from './basisrente'
import { calculateAvdFunding } from './altersvorsorgedepot'
import { calculateRiesterFunding } from './riester'
import { calculateBavFunding, } from './salary'
import { deriveBavLumpSumTaxMode } from './bavPayout'
import { deriveInsuranceTaxMode } from './insurancePayout'
import { projectStatutoryPension } from './grv'

export interface SimulationContext {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  rules: GermanRules
  /** Calendar year when the user reaches retirementAge. Used for cohort-table lookups. */
  payoutYear: number
  yearsToRetirement: number
  bavFunding: BavFundingResult
  bavLumpSumTaxMode: BavLumpSumTaxMode
  /** Derived from contract start year, runtime, and retirement age — excludes 'ertragsanteil'
   *  (that mode is set internally by netInsurancePayout when payoutMode === 'leibrente'). */
  insuranceTaxMode: 'pre2005' | 'halbeinkuenfte' | 'abgeltungsteuer'
  basisrenteFunding: BasisrenteFundingResult
  altersvorsorgedepotFunding: AltersvorsorgedepotFundingResult
  riesterFunding: RiesterFundingResult
  statutoryPension: StatutoryPensionResult
  /**
   * Gross GRV pension at retirement (EUR/month). Threaded into every product's
   * standalone marginal-tax pipeline as `statutoryPensionAnnual` so the bracket
   * the product income lands in reflects the realistic combined retirement
   * income — not just the product taxed alone below the Grundfreibetrag.
   * Per-product user-input `monthlyOtherRetirementIncome` (= manual extra,
   * fully taxable) stacks ON TOP of this.
   */
  grvGrossMonthlyPension: number
  /**
   * Shared retirement health-insurance status — drives KV/PV treatment for AVD,
   * Riester, and Basisrente payouts. KVdR Pflichtversicherte owe no KV/PV on
   * sonstige-Einkünfte payouts; freiwillig_gkv pay the full §240 SGB V rate; PKV
   * never pays statutory KV/PV. Defaults to 'kvdr' when not set.
   */
  retirementHealthStatus: 'kvdr' | 'freiwillig_gkv' | 'pkv'
  /**
   * Optional stochastic high-risk market path for Monte Carlo runs. Each entry is
   * one accumulation-year gross return. Product-specific fees, wrappers, tax
   * treatment, and AVD glidepath allocation still apply on top.
   */
  marketReturnPath?: readonly number[]
}

/**
 * Optional overrides for buildContext (Group G issue 03 — additive only).
 *
 * Used by `simulatePortfolio` to inject pre-computed funding shares for the
 * active per-product instance, so cross-instance caps (bAV §3 Nr. 63 + §1 SvEV,
 * Basisrente §10 Abs. 3, Riester §10a / §86) can be applied at the workspace
 * level before per-instance simulation.
 *
 * Existing callers (simulateRetirementComparison, every test, every direct
 * call) pass nothing and behave identically. The legacy path is preserved.
 */
export interface BuildContextOverrides {
  /**
   * Pre-computed bAV funding for the active bAV instance. When provided,
   * replaces the bAV funding that buildContext would otherwise calculate from
   * `assumptions.bav`. Used so the fair-comparison invariant (ETF + pAV invest
   * `bavFunding.monthlyNetCost`) reflects the cross-instance cap apportionment.
   */
  bavFundingOverride?: BavFundingResult
  /**
   * Pre-computed Basisrente funding for the active instance. Similar shape.
   * Optional — when missing, buildContext falls back to deriving from
   * `assumptions.basisrente`.
   */
  basisrenteFundingOverride?: BasisrenteFundingResult
  /** Pre-computed Altersvorsorgedepot funding for the active instance. */
  altersvorsorgedepotFundingOverride?: AltersvorsorgedepotFundingResult
  /** Pre-computed Riester funding for the active instance. */
  riesterFundingOverride?: RiesterFundingResult
}

export function buildContext(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  rules: GermanRules,
  overrides?: BuildContextOverrides,
): SimulationContext {
  const bavFunding = overrides?.bavFundingOverride
    ?? calculateBavFunding(profile, rules, assumptions.bav)
  const payoutYear = rules.year + (profile.retirementAge - profile.age)
  const contractRuntimeYears = payoutYear - assumptions.insurance.contractStartYear
  const insuranceTaxMode = deriveInsuranceTaxMode(
    assumptions.insurance.contractStartYear,
    contractRuntimeYears,
    profile.retirementAge,
    assumptions.insurance.oldContractTaxFreeEligible,
  )
  const bavLumpSumTaxMode = deriveBavLumpSumTaxMode(
    assumptions.bav.durchfuehrungsweg,
    assumptions.bav.pre2005EligibleTaxFree,
  )
  // Schicht-1 cap: when the user is in a Versorgungswerk, their VW contributions (not GRV)
  // count toward the §10 Abs. 3 EStG cap. For Beamtenpension/none: no pension contributions.
  const { pensionBaselineType, versorgungswerkMonthlyContribution, versorgungswerkEmployerMonthly } =
    assumptions.statutoryPension
  let pensionSystemAnnualContributionOverride: number | undefined
  if (pensionBaselineType === 'versorgungswerk') {
    pensionSystemAnnualContributionOverride =
      ((versorgungswerkMonthlyContribution ?? 0) + (versorgungswerkEmployerMonthly ?? 0)) * 12
  } else if (pensionBaselineType === 'beamtenpension' || pensionBaselineType === 'none') {
    pensionSystemAnnualContributionOverride = 0
  }
  // All three Schicht-2/-1 funding calculations share the same salary zvE base from bavFunding.
  const basisrenteFunding = overrides?.basisrenteFundingOverride
    ?? calculateBasisrenteFunding(
      rules,
      bavFunding.salaryWithBav,
      assumptions.basisrente,
      pensionSystemAnnualContributionOverride,
    )
  const altersvorsorgedepotFunding = overrides?.altersvorsorgedepotFundingOverride
    ?? calculateAvdFunding(rules, bavFunding.salaryWithBav, assumptions.altersvorsorgedepot)
  const riesterFunding = overrides?.riesterFundingOverride
    ?? calculateRiesterFunding(rules, bavFunding.salaryWithBav, assumptions.riester, profile)

  const grvProjection = projectStatutoryPension(
    profile,
    rules,
    assumptions.statutoryPension,
    bavFunding.estimatedMonthlyGrvReduction,
    payoutYear,
  )

  return {
    profile,
    assumptions,
    rules,
    payoutYear,
    yearsToRetirement: profile.retirementAge - profile.age,
    bavFunding,
    bavLumpSumTaxMode,
    insuranceTaxMode,
    basisrenteFunding,
    altersvorsorgedepotFunding,
    riesterFunding,
    statutoryPension: grvProjection,
    grvGrossMonthlyPension: grvProjection.grossMonthlyPension,
    retirementHealthStatus: assumptions.statutoryPension.retirementHealthStatus ?? 'kvdr',
  }
}
