/**
 * PortfolioFunding — cross-instance funding apportionment.
 *
 * Extracted from portfolioAdapter.ts (architecture-readability issue 05).
 *
 * This module owns all paid-up funding helpers and the main cross-instance
 * funding aggregation function `buildPortfolioFunding`. It apportions bAV,
 * Basisrente, Altersvorsorgedepot, and Riester funding across portfolio
 * instances, respecting statutory cap constraints.
 *
 * Caps handled:
 *   - bAV §3 Nr. 63 + §1 SvEV: proportional scaling when aggregate exceeds cap.
 *   - Basisrente §10 Abs. 3 (Schicht-1): proportional scaling when aggregate
 *     exceeds the remaining cap after GRV/Versorgungswerk contributions.
 *   - Riester §10a EStG: proportional scaling when aggregate exceeds the
 *     2 100 EUR/year cap incl. allowances.
 *   - AVD (AltZertG): per-contract cap; no cross-instance scaling needed.
 *
 * Projection helpers live in `portfolioProjection.ts`.
 * Transfer/capital policy lives in `portfolioTransfer.ts`.
 * Sparerpauschbetrag allocation lives in `portfolioAllowance.ts`.
 */

import type {
  AltersvorsorgedepotAssumptions,
  AltersvorsorgedepotFundingResult,
  BasisrenteAssumptions,
  BasisrenteFundingResult,
  BavAssumptions,
  BavFundingResult,
  GermanRules,
  PersonalProfile,
  RiesterAssumptions,
  RiesterFundingResult,
  SalaryResult,
} from '../domain'
import type { PortfolioFunding, Workspace } from '../domain/workspace'
import { calculateBavFunding, calculateSalaryResult } from './salary'
import { calculateBasisrenteFunding } from './basisrente'
import { calculateAvdFunding } from './altersvorsorgedepot'
import { calculateRiesterFunding } from './riester'
import { stripInstanceCommonKeys } from './portfolioProjection'

// ---------------------------------------------------------------------------
// Paid-up funding helpers
// ---------------------------------------------------------------------------
//
// When an instance has `status === 'paid_up'`, contributions stop and the
// contract switches to a "phase-2" fee model. The funding helpers below
// produce zero-contribution funding results for paid-up instances so:
//   - bAV: salary baseline (`salaryWithBav`) reflects "no bAV deduction"
//     — exactly what a paid-up bAV looks like to payroll.
//   - Basisrente: zero gross contribution so the Schicht-1 cap is not consumed.
//   - AVD: zero own contribution AND zeroed eligibility so no new Zulage accrues.
//   - Riester: zero own contribution AND zeroed eligibility so no new state
//     allowances accrue; clawback is NOT triggered.

/**
 * Build a `BavFundingResult` for a paid-up bAV instance.
 * Zero contribution, zero employer subsidy, zero tax/SV savings. We still
 * call `calculateBavFunding` with a zeroed singleton so the salary baseline
 * (`salaryWithBav`) reflects "no bAV deduction".
 */
export function paidUpBavFunding(
  profile: PersonalProfile,
  rules: GermanRules,
  singleton: BavAssumptions,
  calc: typeof calculateBavFunding,
): BavFundingResult {
  const zeroed: BavAssumptions = {
    ...singleton,
    monthlyGrossConversion: 0,
    statutoryMinimumSubsidyEnabled: false,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
  }
  return calc(profile, rules, zeroed)
}

/** Build a paid-up Basisrente funding result. */
export function paidUpBasisrenteFunding(
  rules: GermanRules,
  salary: SalaryResult,
  singleton: BasisrenteAssumptions,
  pensionSystemAnnualOverride: number | undefined,
  calc: typeof calculateBasisrenteFunding,
): BasisrenteFundingResult {
  const zeroed: BasisrenteAssumptions = { ...singleton, monthlyGrossContribution: 0 }
  return calc(rules, salary, zeroed, pensionSystemAnnualOverride)
}

/**
 * Build a paid-up AVD funding result.
 * Zero own contribution AND eligibility so allowances stop accruing.
 */
export function paidUpAvdFunding(
  rules: GermanRules,
  salary: SalaryResult,
  singleton: AltersvorsorgedepotAssumptions,
  calc: typeof calculateAvdFunding,
): AltersvorsorgedepotFundingResult {
  const zeroed: AltersvorsorgedepotAssumptions = {
    ...singleton,
    monthlyOwnContribution: 0,
    eligibility: {
      directlyEligible: false,
      indirectSpouseEligible: false,
      eligibleChildren: 0,
      ageAtContractStart: singleton.eligibility.ageAtContractStart,
      careerStarterBonusUsed: true,
    },
  }
  return calc(rules, salary, zeroed)
}

/**
 * Build a paid-up Riester funding result.
 * Zero contribution AND eligibility — no new state allowances during paid-up
 * phase. Existing accumulated capital continues to grow via
 * `instanceCapitalPolicy.initialCapital`. Clawback is NOT triggered.
 */
export function paidUpRiesterFunding(
  rules: GermanRules,
  salary: SalaryResult,
  singleton: RiesterAssumptions,
  calc: (rules: GermanRules, salary: SalaryResult, singleton: RiesterAssumptions) => RiesterFundingResult,
): RiesterFundingResult {
  const zeroed: RiesterAssumptions = {
    ...singleton,
    monthlyOwnContribution: 0,
    eligibility: {
      directlyEligible: false,
      indirectSpouseEligible: false,
      ageAtContractStart: singleton.eligibility.ageAtContractStart,
      careerStarterBonusUsed: true,
    },
  }
  return calc(rules, salary, zeroed)
}

// ---------------------------------------------------------------------------
// Portfolio-aware funding pre-step
// ---------------------------------------------------------------------------

/**
 * Aggregate cross-instance shared budgets BEFORE per-instance simulation.
 *
 * Caps handled:
 *   - bAV §3 Nr. 63 + §1 SvEV: single user/single employer assumption (P1).
 *     Sum monthlyGrossConversion across active bAV instances, scale each
 *     instance proportionally so the aggregate respects the cap, then call
 *     `calculateBavFunding` with the scaled gross. The statutory subsidy
 *     follows proportionally because it's derived from the scaled gross
 *     conversion inside `calculateBavFunding`.
 *   - Basisrente §10 Abs. 3: sum monthlyGrossContribution; scale; call
 *     `calculateBasisrenteFunding` with the scaled value. The §10 Abs. 3
 *     deductible cap then no longer binds inside the funding helper because
 *     the aggregate is already capped.
 *   - Riester §10a / §86: sum monthlyOwnContribution; scale; call
 *     `calculateRiesterFunding` with the scaled value. Allowance + Mindesteigen-
 *     beitrag are computed at the per-instance level by the existing helper
 *     (which takes the proper scaled value as input).
 *   - AVD §10a + AltZertG contract cap: sum monthlyOwnContribution; scale.
 *
 * Sparerpauschbetrag (ETF cross-instance allowance): apportioned downstream
 * by `applyCrossInstanceSparerpauschbetrag` in `portfolioAllowance.ts`, after
 * the per-instance results return.
 *
 * Surrendered and offered instances are skipped — they contribute zero to
 * the cap and do not appear in the per-instance funding map.
 */
export function buildPortfolioFunding(
  workspace: Workspace,
  rules: GermanRules,
): PortfolioFunding {
  const profile = workspace.baseline.profile
  const wsa = workspace.baseline.assumptions
  const notes: string[] = []

  // -------------------------------------------------------------------------
  // bAV cap aggregation
  // -------------------------------------------------------------------------
  // Paid-up instances do NOT consume cap headroom (no contributions flowing).
  // We still emit a funding entry for them via `paidUpBavFunding` so the
  // simulator runs against a zero-contribution baseline.
  const allBav = wsa.bav.filter(b => b.status !== 'surrendered' && b.status !== 'offered')
  const activeBav = allBav.filter(b => b.status === 'active')
  const paidUpBav = allBav.filter(b => b.status === 'paid_up')
  const totalBavGrossMonthly = activeBav.reduce(
    (s, b) => s + (b.monthlyGrossConversion ?? 0),
    0,
  )
  const bavTaxFreeLimitAnnual =
    rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap
  const bavTaxFreeLimitMonthly = bavTaxFreeLimitAnnual / 12

  // Scale factor: 1 if aggregate is under the cap, else cap / aggregate.
  // Note: this only scales the EMPLOYEE conversion. Statutory subsidy follows
  // because it's a function of the scaled gross conversion inside
  // calculateBavFunding. Contractual subsidies stay attached to each instance.
  const bavScale =
    totalBavGrossMonthly > bavTaxFreeLimitMonthly && totalBavGrossMonthly > 0
      ? bavTaxFreeLimitMonthly / totalBavGrossMonthly
      : 1

  const bavByInstanceId: Record<string, BavFundingResult> = {}
  for (const inst of activeBav) {
    // Build the singleton bAV assumptions used by calculateBavFunding.
    // Strip InstanceCommon keys; bavFunding does not read them.
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BavAssumptions
    const scaledSingleton: BavAssumptions = bavScale === 1
      ? singleton
      : { ...singleton, monthlyGrossConversion: singleton.monthlyGrossConversion * bavScale }
    bavByInstanceId[inst.instanceId] = calculateBavFunding(profile, rules, scaledSingleton)
  }
  for (const inst of paidUpBav) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BavAssumptions
    bavByInstanceId[inst.instanceId] = paidUpBavFunding(profile, rules, singleton, calculateBavFunding)
  }

  // -------------------------------------------------------------------------
  // Basisrente cap aggregation
  // -------------------------------------------------------------------------
  // We need a salary baseline for the Basisrente / AVD / Riester funding
  // helpers. Use the FIRST active bAV instance's salaryWithBav when present;
  // otherwise compute a pristine salary (no bAV).
  const firstBavFunding = activeBav.length > 0
    ? bavByInstanceId[activeBav[0].instanceId]
    : undefined
  const salaryForOtherFunding =
    firstBavFunding?.salaryWithBav ?? calculateSalaryResult(profile, rules, 0)

  // Versorgungswerk override (mirrors buildContext logic).
  const { pensionBaselineType, versorgungswerkMonthlyContribution, versorgungswerkEmployerMonthly } =
    wsa.statutoryPension
  let pensionSystemAnnualContributionOverride: number | undefined
  if (pensionBaselineType === 'versorgungswerk') {
    pensionSystemAnnualContributionOverride =
      ((versorgungswerkMonthlyContribution ?? 0) + (versorgungswerkEmployerMonthly ?? 0)) * 12
  } else if (pensionBaselineType === 'beamtenpension' || pensionBaselineType === 'none') {
    pensionSystemAnnualContributionOverride = 0
  }

  const allBasisrente = wsa.basisrente.filter(b => b.status !== 'surrendered' && b.status !== 'offered')
  const activeBasisrente = allBasisrente.filter(b => b.status === 'active')
  const paidUpBasisrente = allBasisrente.filter(b => b.status === 'paid_up')
  const totalBasisrenteGrossMonthly = activeBasisrente.reduce(
    (s, b) => s + (b.monthlyGrossContribution ?? 0),
    0,
  )
  // The Schicht-1 cap is shared. We compute the remaining cap once at the
  // workspace level (after subtracting the GRV / VW pension-system contributions
  // that count toward the cap), then proportionally scale Basisrente
  // contributions if the aggregate exceeds it.
  let annualPensionContributionsTowardsCap: number
  if (pensionSystemAnnualContributionOverride !== undefined) {
    annualPensionContributionsTowardsCap = pensionSystemAnnualContributionOverride
  } else {
    const annualGrvEmployee = salaryForOtherFunding.social.pension
    const annualGrvEmployer =
      rules.socialSecurity.pensionEmployeeRate > 0
        ? (annualGrvEmployee / rules.socialSecurity.pensionEmployeeRate) *
          rules.socialSecurity.pensionEmployerRate
        : annualGrvEmployee
    annualPensionContributionsTowardsCap = annualGrvEmployee + annualGrvEmployer
  }
  const remainingSchicht1CapAnnual = Math.max(
    0,
    rules.basisrente.schicht1CapSingle - annualPensionContributionsTowardsCap,
  )
  const remainingSchicht1CapMonthly = remainingSchicht1CapAnnual / 12
  const totalBasisrenteAnnual = totalBasisrenteGrossMonthly * 12

  // Scale: only when the aggregate exceeds the remaining Schicht-1 headroom.
  // Each instance's funding helper would normally apply the same cap inside;
  // we scale here so two instances at, say, 1500 EUR/month each don't both
  // see the full cap headroom and double-count the deduction.
  const basisrenteScale =
    totalBasisrenteAnnual > remainingSchicht1CapAnnual && totalBasisrenteAnnual > 0
      ? remainingSchicht1CapMonthly / totalBasisrenteGrossMonthly
      : 1

  const basisrenteByInstanceId: Record<string, BasisrenteFundingResult> = {}
  for (const inst of activeBasisrente) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BasisrenteAssumptions
    const scaledSingleton: BasisrenteAssumptions = basisrenteScale === 1
      ? singleton
      : { ...singleton, monthlyGrossContribution: singleton.monthlyGrossContribution * basisrenteScale }
    basisrenteByInstanceId[inst.instanceId] = calculateBasisrenteFunding(
      rules,
      salaryForOtherFunding,
      scaledSingleton,
      pensionSystemAnnualContributionOverride,
    )
  }
  for (const inst of paidUpBasisrente) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BasisrenteAssumptions
    basisrenteByInstanceId[inst.instanceId] = paidUpBasisrenteFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      pensionSystemAnnualContributionOverride,
      calculateBasisrenteFunding,
    )
  }

  // -------------------------------------------------------------------------
  // AVD aggregation (AltZertG contract cap + §10a)
  // -------------------------------------------------------------------------
  const allAvd = wsa.altersvorsorgedepot.filter(a => a.status !== 'surrendered' && a.status !== 'offered')
  const activeAvd = allAvd.filter(a => a.status === 'active')
  const paidUpAvd = allAvd.filter(a => a.status === 'paid_up')
  // AVD has a per-contract contributionCap (6840 EUR/year for 2026). The cap is
  // per-contract, not per-portfolio, so we don't scale across instances.
  // §10a deduction is handled inside the funding helper.
  const altersvorsorgedepotByInstanceId: Record<string, AltersvorsorgedepotFundingResult> = {}
  for (const inst of activeAvd) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as AltersvorsorgedepotAssumptions
    altersvorsorgedepotByInstanceId[inst.instanceId] = calculateAvdFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      { profile },
    )
  }
  for (const inst of paidUpAvd) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as AltersvorsorgedepotAssumptions
    altersvorsorgedepotByInstanceId[inst.instanceId] = paidUpAvdFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      calculateAvdFunding,
    )
  }

  // -------------------------------------------------------------------------
  // Riester aggregation (§10a / §86 + allowances)
  // -------------------------------------------------------------------------
  const allRiester = wsa.riester.filter(r => r.status !== 'surrendered' && r.status !== 'offered')
  const activeRiester = allRiester.filter(r => r.status === 'active')
  const paidUpRiester = allRiester.filter(r => r.status === 'paid_up')
  const totalRiesterGrossMonthly = activeRiester.reduce(
    (s, r) => s + (r.monthlyOwnContribution ?? 0),
    0,
  )
  // §10a EStG cap is 2,100 EUR/year incl. allowances. Each instance helper applies
  // the cap inside; we scale here so two instances at the cap each don't both claim
  // the full deduction. Use a coarse aggregate scaling: when total annual own
  // contributions exceed the cap, scale each instance proportionally.
  const riesterCapAnnual = rules.riester.annualCapInclAllowances
  const totalRiesterAnnual = totalRiesterGrossMonthly * 12
  const riesterScale =
    totalRiesterAnnual > riesterCapAnnual && totalRiesterAnnual > 0
      ? riesterCapAnnual / totalRiesterAnnual
      : 1

  const riesterByInstanceId: Record<string, RiesterFundingResult> = {}
  for (const inst of activeRiester) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as RiesterAssumptions
    const scaledSingleton: RiesterAssumptions = riesterScale === 1
      ? singleton
      : { ...singleton, monthlyOwnContribution: singleton.monthlyOwnContribution * riesterScale }
    riesterByInstanceId[inst.instanceId] = calculateRiesterFunding(
      rules,
      salaryForOtherFunding,
      scaledSingleton,
      profile,
    )
  }
  for (const inst of paidUpRiester) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as RiesterAssumptions
    riesterByInstanceId[inst.instanceId] = paidUpRiesterFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      (r, s, si) => calculateRiesterFunding(r, s, si, profile),
    )
  }

  return {
    bavByInstanceId,
    basisrenteByInstanceId,
    altersvorsorgedepotByInstanceId,
    riesterByInstanceId,
    notes,
  }
}
