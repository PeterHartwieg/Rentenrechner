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
 *   - bAV §3 Nr. 63 + §1 SvEV: two-pass proportional scaling when aggregate total
 *     bAV (employee + employer) exceeds cap; household-level post-bAV salary
 *     derived from the combined capped conversions across all active instances.
 *   - Basisrente §10 Abs. 3 (Schicht-1): proportional scaling when aggregate
 *     exceeds the remaining cap after GRV/Versorgungswerk contributions.
 *   - Riester §10a EStG: proportional scaling when aggregate exceeds the
 *     2 100 EUR/year cap incl. allowances.
 *   - AVD (AltZertG): per-contract cap plus one career-starter bonus per saver.
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
import { calculateAvdFunding, maxAvdMonthlyOwnContribution } from './altersvorsorgedepot'
import { allocateRiesterHouseholdFunding, calculateRiesterFunding } from './riester'
import { stripInstanceCommonKeys } from './portfolioProjection'
import { childBirthYearsUnder25InYear } from './childEligibility'

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
 * Whether the saver has legally consumed the once-per-lifetime career-starter
 * bonus. Legacy compare-mode defaults set the display flag even for contracts
 * whose start age was above the statutory limit, so the flag alone is not
 * authoritative. Offered contracts are proposals rather than completed use;
 * surrendered contracts still preserve valid historical use.
 */
export function hasUsedCareerStarterBonus(
  assumptions: Workspace['baseline']['assumptions'],
  rules: GermanRules,
): boolean {
  const avdUsed = assumptions.altersvorsorgedepot.some(
    (instance) =>
      instance.status !== 'offered' &&
      instance.eligibility.careerStarterBonusUsed &&
      instance.eligibility.directlyEligible &&
      instance.eligibility.ageAtContractStart <=
        rules.altersvorsorgedepot.careerStarterMaxAge,
  )
  const riesterUsed = assumptions.riester.some(
    (instance) =>
      instance.status !== 'offered' &&
      instance.eligibility.careerStarterBonusUsed &&
      instance.eligibility.directlyEligible &&
      instance.eligibility.ageAtContractStart <=
        rules.riester.careerStarterMaxAge,
  )
  return avdUsed || riesterUsed
}

/**
 * Aggregate cross-instance shared budgets BEFORE per-instance simulation.
 *
 * Caps handled:
 *   - bAV §3 Nr. 63 + §1 SvEV: single user/single employer assumption (P1).
 *     Two-pass approach: first run calculateBavFunding at full gross for each
 *     instance to get preliminary total bAV (employee + employer). Sum across
 *     instances. If aggregate exceeds the §3 Nr. 63 limit, scale each instance's
 *     monthlyGrossConversion proportionally; employer contributions scale with it
 *     because they are derived from gross in calculateBavFunding's fixed-point loop.
 *     After scaling, derive a household-level post-bAV salary baseline by summing
 *     all instances' capped employee gross conversions and calling
 *     calculateSalaryResult once with the aggregate. Downstream Basisrente / AVD /
 *     Riester funding uses this combined baseline.
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
  //
  // The §3 Nr. 63 / §1 SvEV cap applies to TOTAL bAV per employee — i.e.
  // the sum of employee salary-sacrifice + employer contribution (statutory
  // subsidy + contractual match) across ALL active instances. The old code
  // only checked the employee conversion, which allowed employer contributions
  // to push the aggregate over the cap. It also derived the downstream salary
  // baseline from only the first instance, ignoring the salary reduction from
  // all other instances.
  //
  // Fix (bisection-based cap enforcement):
  //   We find the contribution scale factor `s` via bisection such that
  //   sum_i(calculateBavFunding(employee_i × s, fixedEmployer_i × s)
  //     .totalBavContributionAnnual) ≤ cap.
  //   A simple proportional scale (cap / aggregate_at_s=1) would overshoot
  //   slightly because employer contributions (statutory subsidy capped by
  //   employer SV savings) are not perfectly linear in the employee gross when
  //   health/care SV bases are already capped at the BBG. Bisection is exact
  //   and converges quickly (30 iterations ≤ 1 EUR/year residual).
  //
  //   After determining `s`, the household-level post-bAV salary baseline is
  //   derived from the aggregate of all instances' capped employee conversions
  //   and passed to Basisrente / AVD / Riester funding so their §10 / AVD
  //   headroom reflects the full bAV salary reduction.
  const allBav = wsa.bav.filter(b => b.status !== 'surrendered' && b.status !== 'offered')
  const activeBav = allBav.filter(b => b.status === 'active')
  const paidUpBav = allBav.filter(b => b.status === 'paid_up')

  const bavTaxFreeLimitAnnual =
    rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap
  const bavSvFreeLimitAnnual =
    rules.socialSecurity.pensionCapYear * rules.bav.socialSecurityFreePctOfPensionCap

  // Build stripped singletons once (reused across bisection iterations and final pass).
  const activeBavSingletons: BavAssumptions[] = activeBav.map(
    inst => stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BavAssumptions,
  )
  // Helper: compute aggregate totalBavContributionAnnual for a given scale.
  // Used both for the "needs scaling?" check and inside the bisection loop.
  function computeAggregateBavTotal(scale: number): number {
    return activeBavSingletons.reduce((sum, singleton) => {
      const scaled: BavAssumptions = scale === 1
        ? singleton
        : {
            ...singleton,
            monthlyGrossConversion: singleton.monthlyGrossConversion * scale,
            contractualFixedMonthly: singleton.contractualFixedMonthly * scale,
          }
      return sum + calculateBavFunding(profile, rules, scaled).totalBavContributionAnnual
    }, 0)
  }

  // Quick check at full scale (s=1) to decide whether bisection is needed.
  const aggregateAtFullScale = activeBavSingletons.length > 0
    ? computeAggregateBavTotal(1)
    : 0
  const needsBavScaling = aggregateAtFullScale > bavTaxFreeLimitAnnual

  let bavScale = 1
  if (needsBavScaling) {
    // Bisection: find `s` ∈ (0, 1] such that computeAggregateBavTotal(s) ≤ bavCap.
    // aggregate(s) is monotone increasing in s → bisection converges.
    let lo = 0
    let hi = 1
    for (let iter = 0; iter < 30; iter++) {
      const mid = (lo + hi) / 2
      const agg = computeAggregateBavTotal(mid)
      if (Math.abs(agg - bavTaxFreeLimitAnnual) < 0.01) {
        lo = mid
        break
      }
      if (agg > bavTaxFreeLimitAnnual) {
        hi = mid
      } else {
        lo = mid
      }
    }
    bavScale = lo
  }

  // Final pass: compute per-instance funding results with the determined scale.
  const bavByInstanceId: Record<string, BavFundingResult> = {}
  for (let i = 0; i < activeBav.length; i++) {
    const inst = activeBav[i]
    const singleton = activeBavSingletons[i]
    const scaledSingleton: BavAssumptions = bavScale === 1
      ? singleton
      : {
          ...singleton,
          monthlyGrossConversion: singleton.monthlyGrossConversion * bavScale,
          contractualFixedMonthly: singleton.contractualFixedMonthly * bavScale,
        }
    bavByInstanceId[inst.instanceId] = calculateBavFunding(profile, rules, scaledSingleton)
  }
  for (const inst of paidUpBav) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as BavAssumptions
    bavByInstanceId[inst.instanceId] = paidUpBavFunding(profile, rules, singleton, calculateBavFunding)
  }

  // -------------------------------------------------------------------------
  // Household-level post-bAV salary baseline
  // -------------------------------------------------------------------------
  // Aggregate the capped employee gross conversions across all active instances
  // and compute a single household-level salary that reflects the full bAV
  // reduction. This baseline is used by Basisrente / AVD / Riester funding so
  // their §10 / AVD headroom is computed against the correct post-bAV income.
  //
  // We derive each instance's effective tax-free / SV-free employee conversion
  // from the BavFundingResult (without new exports from salary.ts):
  //   effectiveTaxFree_i = max(0, min(employeeGross_i, taxFreePortionAnnual_i − employerContribution_i))
  //   effectiveSvFree_i  = max(0, min(employeeGross_i, svFreePortionAnnual_i  − employerContribution_i))
  // Sum these across instances, clamped to the statutory limits, then call
  // calculateSalaryResult once with the household aggregates.
  let totalEmployeeGrossAnnual = 0
  let totalEffectiveTaxFreeAnnual = 0
  let totalEffectiveSvFreeAnnual = 0
  for (const inst of activeBav) {
    const f = bavByInstanceId[inst.instanceId]
    totalEmployeeGrossAnnual += f.annualGrossConversion
    const instEffectiveTaxFree = Math.max(
      0,
      Math.min(f.annualGrossConversion, f.taxFreePortionAnnual - f.annualEmployerContribution),
    )
    const instEffectiveSvFree = Math.max(
      0,
      Math.min(f.annualGrossConversion, f.svFreePortionAnnual - f.annualEmployerContribution),
    )
    totalEffectiveTaxFreeAnnual += instEffectiveTaxFree
    totalEffectiveSvFreeAnnual += instEffectiveSvFree
  }
  // Clamp to statutory limits (defensive: rounding in the bisection can nudge slightly over).
  totalEffectiveTaxFreeAnnual = Math.min(totalEffectiveTaxFreeAnnual, bavTaxFreeLimitAnnual)
  totalEffectiveSvFreeAnnual = Math.min(totalEffectiveSvFreeAnnual, bavSvFreeLimitAnnual)

  const salaryForOtherFunding = activeBav.length > 0
    ? calculateSalaryResult(
        profile,
        rules,
        totalEmployeeGrossAnnual,
        totalEffectiveTaxFreeAnnual,
        totalEffectiveSvFreeAnnual,
      )
    : calculateSalaryResult(profile, rules, 0)

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
  const allRiester = wsa.riester.filter(r => r.status !== 'surrendered' && r.status !== 'offered')
  const activeRiester = allRiester.filter(r => r.status === 'active')
  const paidUpRiester = allRiester.filter(r => r.status === 'paid_up')
  const accumulationYears = Math.max(1, profile.retirementAge - profile.age)
  // `careerStarterBonusUsed` records historical use. Surrendering or replacing
  // the contract does not restore the saver's once-per-lifetime entitlement.
  const careerStarterBonusAlreadyUsed = hasUsedCareerStarterBonus(wsa, rules)
  const householdRiesterOwnMonthly = activeRiester.reduce(
    (sum, instance) => sum + instance.monthlyOwnContribution,
    0,
  )
  const careerStarterCandidates = careerStarterBonusAlreadyUsed
    ? []
    : [
        ...activeAvd
          .map((instance) => {
            const singleton = stripInstanceCommonKeys(
              instance as unknown as Record<string, unknown>,
            ) as unknown as AltersvorsorgedepotAssumptions
            const withBonus = calculateAvdFunding(
              rules,
              salaryForOtherFunding,
              singleton,
              {
                profile,
                contributionYear: rules.year,
                isFirstContributionYear: true,
              },
            )
            const withoutBonus = calculateAvdFunding(
              rules,
              salaryForOtherFunding,
              singleton,
              {
                profile,
                contributionYear: rules.year,
                isFirstContributionYear: false,
              },
            )
            return {
              instanceId: instance.instanceId,
              contractStartYear: instance.contractStartYear,
              allowanceClaimAnnual: withBonus.totalAllowanceAnnual,
              careerStarterBonusAnnual: withBonus.careerStarterBonusAnnual,
              realisedBenefitAnnual:
                withBonus.totalContractContributionAnnual +
                withBonus.guenstigerpruefungBenefitAnnual -
                withoutBonus.totalContractContributionAnnual -
                withoutBonus.guenstigerpruefungBenefitAnnual,
            }
          })
          .filter(
            (candidate) =>
              candidate.careerStarterBonusAnnual > 0 &&
              candidate.realisedBenefitAnnual >= 0,
          ),
        ...activeRiester
          .map((instance) => {
            const singleton = stripInstanceCommonKeys(
              instance as unknown as Record<string, unknown>,
            ) as unknown as RiesterAssumptions
            const withBonus = calculateRiesterFunding(
              rules,
              salaryForOtherFunding,
              {
                ...singleton,
                monthlyOwnContribution: householdRiesterOwnMonthly,
              },
              profile,
              {
                contributionYear: rules.year,
                isFirstContributionYear: true,
              },
            )
            const withoutBonus = calculateRiesterFunding(
              rules,
              salaryForOtherFunding,
              {
                ...singleton,
                monthlyOwnContribution: householdRiesterOwnMonthly,
              },
              profile,
              {
                contributionYear: rules.year,
                isFirstContributionYear: false,
              },
            )
            return {
              instanceId: instance.instanceId,
              contractStartYear: instance.contractStartYear,
              allowanceClaimAnnual: withBonus.totalAllowanceAnnual,
              careerStarterBonusAnnual: withBonus.careerStarterBonusAnnual,
              realisedBenefitAnnual:
                withBonus.annualOwnContribution +
                withBonus.totalAllowanceAnnual +
                withBonus.guenstigerpruefungBenefitAnnual -
                withoutBonus.annualOwnContribution -
                withoutBonus.totalAllowanceAnnual -
                withoutBonus.guenstigerpruefungBenefitAnnual,
            }
          })
          .filter(
            (candidate) =>
              candidate.careerStarterBonusAnnual > 0 &&
              candidate.realisedBenefitAnnual >= 0,
          ),
      ].sort(
        (left, right) =>
          right.realisedBenefitAnnual - left.realisedBenefitAnnual ||
          right.allowanceClaimAnnual - left.allowanceClaimAnnual ||
          left.contractStartYear - right.contractStartYear ||
          left.instanceId.localeCompare(right.instanceId),
      )
  const careerStarterBonusRecipientId = careerStarterCandidates[0]?.instanceId
  const eligibilityForCareerStarterAllocation = <T extends { careerStarterBonusUsed: boolean }>(
    instanceId: string,
    eligibility: T,
  ): T => ({
    ...eligibility,
    careerStarterBonusUsed:
      eligibility.careerStarterBonusUsed || instanceId !== careerStarterBonusRecipientId,
  })
  // AVD has a per-contract contributionCap (6840 EUR/year for 2026). The cap is
  // per-contract, not per-portfolio, so we don't scale across instances.
  // §10a deduction is handled inside the funding helper. The career-starter
  // bonus belongs to the saver, so only the recipient with the largest realised
  // increase in contract funding plus tax benefit may claim it across all active
  // AVD and Riester contracts. This prevents a capped contract from absorbing it.
  const altersvorsorgedepotByInstanceId: Record<string, AltersvorsorgedepotFundingResult> = {}
  const altersvorsorgedepotYearlyByInstanceId: Record<
    string,
    AltersvorsorgedepotFundingResult[]
  > = {}
  for (const inst of activeAvd) {
    const rawSingleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as AltersvorsorgedepotAssumptions
    const singleton: AltersvorsorgedepotAssumptions = {
      ...rawSingleton,
      eligibility: eligibilityForCareerStarterAllocation(
        inst.instanceId,
        rawSingleton.eligibility,
      ),
    }
    const schedule = Array.from({ length: accumulationYears }, (_, yearIndex) =>
      calculateAvdFunding(rules, salaryForOtherFunding, singleton, {
        profile,
        contributionYear: rules.year + yearIndex,
        isFirstContributionYear:
          yearIndex === 0 && !singleton.eligibility.careerStarterBonusUsed,
      }),
    )
    altersvorsorgedepotByInstanceId[inst.instanceId] = schedule[0]
    altersvorsorgedepotYearlyByInstanceId[inst.instanceId] = schedule
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
    altersvorsorgedepotYearlyByInstanceId[inst.instanceId] = Array.from(
      { length: accumulationYears },
      () => altersvorsorgedepotByInstanceId[inst.instanceId],
    )
  }

  // -------------------------------------------------------------------------
  // Riester aggregation (§10a / §86 + allowances)
  // -------------------------------------------------------------------------
  const activeRiesterSingletons = activeRiester.map((instance) => ({
    instance,
    singleton: (() => {
      const singleton = stripInstanceCommonKeys(
        instance as unknown as Record<string, unknown>,
      ) as unknown as RiesterAssumptions
      return {
        ...singleton,
        eligibility: eligibilityForCareerStarterAllocation(
          instance.instanceId,
          singleton.eligibility,
        ),
      }
    })(),
  }))
  // §10a EStG caps own contributions plus allowances at €2,100 per saver.
  // V1 instances all belong to that saver: calculate the household benefit
  // from aggregate own contributions and assign it to the eligible contract
  // with the largest allowance claim. Other contracts retain only their own
  // contributions. The simulator carries this allocation through every year.
  // Calculate both parts inside the scale pass: allowance proration changes
  // with the accepted own contribution, so scaling own contributions alone can
  // leave the simulated contract inflow above the cap.
  const riesterCapAnnual = rules.riester.annualCapInclAllowances

  function calculateActiveRiester(
    entries: typeof activeRiesterSingletons,
    yearIndex = 0,
  ): Record<string, RiesterFundingResult> {
    const contributionYear = rules.year + yearIndex
    const householdOwnMonthly = entries.reduce(
      (sum, { singleton }) => sum + singleton.monthlyOwnContribution,
      0,
    )
    const householdCandidates = entries.map(({ instance, singleton }) => ({
      instanceId: instance.instanceId,
      eligibility: singleton.eligibility,
      funding: calculateRiesterFunding(
        rules,
        salaryForOtherFunding,
        { ...singleton, monthlyOwnContribution: householdOwnMonthly },
        profile,
        {
          contributionYear,
          isFirstContributionYear:
            yearIndex === 0 && !singleton.eligibility.careerStarterBonusUsed,
        },
      ),
    }))
    const recipient = householdCandidates.reduce<(typeof householdCandidates)[number] | undefined>(
      (best, candidate) =>
        !best || candidate.funding.totalAllowanceAnnual > best.funding.totalAllowanceAnnual
          ? candidate
          : best,
      undefined,
    )
    if (!recipient) return {}

    return Object.fromEntries(entries.map(({ instance, singleton }) => {
      const ownFunding = calculateRiesterFunding(
        rules,
        salaryForOtherFunding,
        singleton,
        profile,
        {
          contributionYear,
          isFirstContributionYear:
            yearIndex === 0 && !singleton.eligibility.careerStarterBonusUsed,
        },
      )
      const receivesPortfolioAllowance = instance.instanceId === recipient?.instanceId
      const portfolioTaxBenefitShare = householdOwnMonthly > 0
        ? ownFunding.monthlyOwnContribution / householdOwnMonthly
        : 0
      const allocated = allocateRiesterHouseholdFunding(
        ownFunding,
        recipient.funding,
        receivesPortfolioAllowance,
        portfolioTaxBenefitShare,
      )

      return [instance.instanceId, {
        ...allocated,
        receivesPortfolioAllowance,
        portfolioHouseholdOwnContributionMonthly: householdOwnMonthly,
        portfolioTaxBenefitShare,
        portfolioHouseholdEligibility: recipient.eligibility,
      }]
    }))
  }

  function calculateActiveRiesterAtScale(
    scale: number,
    yearIndex = 0,
  ): Record<string, RiesterFundingResult> {
    return calculateActiveRiester(activeRiesterSingletons.map(({ instance, singleton }) => ({
      instance,
      singleton: scale === 1
        ? singleton
        : {
            ...singleton,
            monthlyOwnContribution: singleton.monthlyOwnContribution * scale,
          },
    })), yearIndex)
  }

  const aggregateRiesterContractAnnual = (
    entries: Record<string, RiesterFundingResult>,
  ): number => Object.values(entries).reduce(
    (sum, funding) =>
      sum + funding.annualOwnContribution + funding.totalAllowanceAnnual,
    0,
  )

  const householdRequestedOwnMonthly = activeRiesterSingletons.reduce(
    (sum, { singleton }) => sum + singleton.monthlyOwnContribution,
    0,
  )

  function calculateRiesterYear(yearIndex: number): {
    acceptedByInstanceId: Record<string, RiesterFundingResult>
    requestedAnnual: number
    needsScaling: boolean
  } {
    const requestedByInstanceId = calculateActiveRiesterAtScale(1, yearIndex)
    const requestedAnnual = aggregateRiesterContractAnnual(requestedByInstanceId)
    const needsScaling = requestedAnnual > riesterCapAnnual
    let scale = 1
    if (needsScaling) {
      let lo = 0
      let hi = 1
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2
        const aggregate = aggregateRiesterContractAnnual(
          calculateActiveRiesterAtScale(mid, yearIndex),
        )
        if (aggregate <= riesterCapAnnual) {
          lo = mid
          if (riesterCapAnnual - aggregate < 0.001) break
        } else hi = mid
      }
      scale = lo
    }

    const accepted = scale === 1
      ? requestedByInstanceId
      : calculateActiveRiesterAtScale(scale, yearIndex)
    const acceptedByInstanceId = Object.fromEntries(
      activeRiesterSingletons.map(({ instance, singleton }) => [
        instance.instanceId,
        {
          ...accepted[instance.instanceId],
          portfolioRequestedOwnContributionMonthly: singleton.monthlyOwnContribution,
          portfolioHouseholdRequestedOwnContributionMonthly: householdRequestedOwnMonthly,
        },
      ]),
    )

    return {
      acceptedByInstanceId,
      requestedAnnual,
      needsScaling,
    }
  }

  const riesterYears = Array.from(
    { length: accumulationYears },
    (_, yearIndex) => calculateRiesterYear(yearIndex),
  )
  const currentRiesterYear = riesterYears[0]
  const requestedRiesterAnnual = currentRiesterYear.requestedAnnual
  const needsRiesterScaling = currentRiesterYear.needsScaling
  const riesterByInstanceId: Record<string, RiesterFundingResult> = {
    ...currentRiesterYear.acceptedByInstanceId,
  }
  const riesterYearlyByInstanceId: Record<string, RiesterFundingResult[]> =
    Object.fromEntries(activeRiesterSingletons.map(({ instance }) => [
      instance.instanceId,
      riesterYears.map((year) => year.acceptedByInstanceId[instance.instanceId]),
    ]))
  for (const inst of paidUpRiester) {
    const singleton = stripInstanceCommonKeys(
      inst as unknown as Record<string, unknown>,
    ) as unknown as RiesterAssumptions
    const funding = paidUpRiesterFunding(
      rules,
      salaryForOtherFunding,
      singleton,
      (r, s, si) => calculateRiesterFunding(r, s, si, profile),
    )
    riesterByInstanceId[inst.instanceId] = funding
    riesterYearlyByInstanceId[inst.instanceId] = Array.from(
      { length: accumulationYears },
      () => funding,
    )
  }

  // -------------------------------------------------------------------------
  // Authoritative headroom snapshot
  // -------------------------------------------------------------------------
  // Keep cap presentation and marginal-decision consumers on the same
  // portfolio pass as simulation. No caller should need to reconstruct these
  // aggregates from raw instance contributions.
  const totalBavAnnual = Object.values(bavByInstanceId).reduce(
    (sum, funding) => sum + funding.totalBavContributionAnnual,
    0,
  )
  const fundedBavAnnual = Math.min(bavTaxFreeLimitAnnual, totalBavAnnual)
  const bavEmployerAnnual = Object.values(bavByInstanceId).reduce(
    (sum, funding) => sum + funding.annualEmployerContribution,
    0,
  )
  const salaryWithoutBav = calculateSalaryResult(profile, rules, 0)

  const fundedBasisrenteProductAnnual = Object.values(basisrenteByInstanceId).reduce(
    (sum, funding) => sum + funding.annualGrossContribution,
    0,
  )
  const requestedBasisrenteProductAnnual = totalBasisrenteAnnual

  const riesterAllowanceAnnual = activeRiester.reduce(
    (sum, instance) =>
      sum + (riesterByInstanceId[instance.instanceId]?.totalAllowanceAnnual ?? 0),
    0,
  )
  const fundedRiesterAnnual = aggregateRiesterContractAnnual(riesterByInstanceId)

  // The recommender adds to the first active Riester contract. Find the exact
  // additional own contribution that remains after its allowance changes,
  // using the same aggregate function as the simulation funding pass.
  let remainingRiesterAnnual = 0
  if (!needsRiesterScaling && activeRiesterSingletons.length > 0) {
    const targetId = activeRiesterSingletons[0].instance.instanceId
    const aggregateWithTopUp = (additionalOwnAnnual: number): number => {
      const entries = activeRiesterSingletons.map(({ instance, singleton }) => {
        const topUpMonthly = instance.instanceId === targetId
          ? additionalOwnAnnual / 12
          : 0
        return {
          instance,
          singleton: {
            ...singleton,
            monthlyOwnContribution: singleton.monthlyOwnContribution + topUpMonthly,
          },
        }
      })
      return aggregateRiesterContractAnnual(calculateActiveRiester(entries))
    }

    let lo = 0
    let hi = riesterCapAnnual
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const aggregate = aggregateWithTopUp(mid)
      if (aggregate <= riesterCapAnnual) {
        lo = mid
        if (riesterCapAnnual - aggregate < 0.001) break
      } else hi = mid
    }
    remainingRiesterAnnual = lo
  }

  const altersvorsorgedepotHeadroomByInstanceId = Object.fromEntries(
    activeAvd.map((instance) => {
      const funding = altersvorsorgedepotByInstanceId[instance.instanceId]
      const requestedAnnual = funding.annualOwnContribution + funding.totalAllowanceAnnual
      const fundedAnnual = funding.totalContractContributionAnnual
      const capAnnual = rules.altersvorsorgedepot.contractContributionCapAnnual
      const effectiveEligibility = {
        ...eligibilityForCareerStarterAllocation(
          instance.instanceId,
          instance.eligibility,
        ),
        eligibleChildren: childBirthYearsUnder25InYear(
          profile.childBirthYears,
          rules.year,
        ).length,
      }
      const maximumOwnAnnual = maxAvdMonthlyOwnContribution(
        effectiveEligibility,
        rules,
        !effectiveEligibility.careerStarterBonusUsed,
      ) * 12
      return [instance.instanceId, {
        capAnnual,
        requestedAnnual,
        fundedAnnual,
        remainingAnnual: Math.max(0, maximumOwnAnnual - funding.annualOwnContribution),
        usedPct: capAnnual > 0 ? Math.min(1, fundedAnnual / capAnnual) : 0,
        constrained: funding.cappedAtContractMax,
        allowanceAnnual: funding.totalAllowanceAnnual,
      }]
    }),
  )

  return {
    bavByInstanceId,
    basisrenteByInstanceId,
    altersvorsorgedepotByInstanceId,
    altersvorsorgedepotYearlyByInstanceId,
    riesterByInstanceId,
    riesterYearlyByInstanceId,
    salaryForOtherFunding,
    headroom: {
      bav: {
        capAnnual: bavTaxFreeLimitAnnual,
        requestedAnnual: aggregateAtFullScale,
        fundedAnnual: fundedBavAnnual,
        remainingAnnual: Math.max(0, bavTaxFreeLimitAnnual - fundedBavAnnual),
        usedPct: bavTaxFreeLimitAnnual > 0
          ? Math.min(1, fundedBavAnnual / bavTaxFreeLimitAnnual)
          : 0,
        constrained: needsBavScaling,
        employeeAnnual: totalEmployeeGrossAnnual,
        employerAnnual: bavEmployerAnnual,
        monthlyNetCost: Math.max(
          0,
          (salaryWithoutBav.annualNet - salaryForOtherFunding.annualNet) / 12,
        ),
      },
      basisrente: {
        capAnnual: rules.basisrente.schicht1CapSingle,
        requestedAnnual:
          annualPensionContributionsTowardsCap + requestedBasisrenteProductAnnual,
        fundedAnnual:
          annualPensionContributionsTowardsCap + fundedBasisrenteProductAnnual,
        remainingAnnual: Math.max(
          0,
          rules.basisrente.schicht1CapSingle -
            annualPensionContributionsTowardsCap -
            fundedBasisrenteProductAnnual,
        ),
        usedPct: rules.basisrente.schicht1CapSingle > 0
          ? Math.min(
              1,
              (annualPensionContributionsTowardsCap + fundedBasisrenteProductAnnual) /
                rules.basisrente.schicht1CapSingle,
            )
          : 0,
        constrained: basisrenteScale < 1,
        pensionSystemAnnual: annualPensionContributionsTowardsCap,
        productAnnual: fundedBasisrenteProductAnnual,
      },
      riester: {
        capAnnual: riesterCapAnnual,
        requestedAnnual: requestedRiesterAnnual,
        fundedAnnual: fundedRiesterAnnual,
        remainingAnnual: remainingRiesterAnnual,
        usedPct: riesterCapAnnual > 0
          ? Math.min(1, fundedRiesterAnnual / riesterCapAnnual)
          : 0,
        constrained: needsRiesterScaling,
        allowanceAnnual: riesterAllowanceAnnual,
      },
      altersvorsorgedepotByInstanceId: altersvorsorgedepotHeadroomByInstanceId,
    },
    notes,
  }
}
