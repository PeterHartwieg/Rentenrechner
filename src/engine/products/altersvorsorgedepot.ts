import type { AltersvorsorgedepotProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
import {
  buildProductResult,
} from '../buildResult'
import {
  afterTaxAvdLumpSum,
  computeAvdGlidepathReturn,
  netAvdPayout,
} from '../altersvorsorgedepot'
import { monthlyPayoutFromCapital } from '../payoutMath'
import { calculateLeibrenteBreakEvenAge } from '../productPayout'

export const metadata = {
  id: 'altersvorsorgedepot' as const,
  label: 'Altersvorsorgedepot (ab 2027)',
  shortLabel: 'AV-Depot',
  color: '#0e7490',
  order: 4,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): AltersvorsorgedepotProductResult {
  const { profile, assumptions, rules, altersvorsorgedepotFunding, payoutYear, yearsToRetirement } = ctx
  const avd = assumptions.altersvorsorgedepot

  // Total monthly contribution into the depot:
  //   regulated contract inflow (own + allowances), capped at the annual AltZertG
  //   contract ceiling (6 840 EUR/year for 2026), plus the Günstigerprüfung tax
  //   refund that the user reinvests on top.
  // Above the cap, the excess own contribution is simply not paid into the contract
  // (Anbieter would refuse it) — the funding helper exposes `cappedAtContractMax`
  // for the UI warning and comparison-card badge.
  const avdMonthlyContribution =
    altersvorsorgedepotFunding.totalContractContributionAnnual / 12 +
    altersvorsorgedepotFunding.guenstigerpruefungBenefitAnnual / 12

  // Blended return for current scenario based on allocation.
  // For Standarddepot: glidepath overrides via yearlyReturnFn; otherwise use constant blend.
  const blendedReturn =
    avd.riskAllocationPct * scenario.annualReturn +
    (1 - avd.riskAllocationPct) * avd.lowRiskAnnualReturn

  const yearlyReturnFn =
    avd.subtype === 'standarddepot'
      ? (yearIndex: number) =>
          computeAvdGlidepathReturn(
            yearIndex,
            yearsToRetirement,
            scenario.annualReturn,
            avd.lowRiskAnnualReturn,
            avd.riskAllocationPct,
            rules,
          )
      : undefined

  // Standarddepot: yearlyReturnFn drives returns; pass scenario.annualReturn as the base
  // so projectAccumulation picks it up via the function. Non-Standarddepot: constant blend.
  const baseReturn = avd.subtype === 'standarddepot' ? scenario.annualReturn : blendedReturn

  // #71: When riesterTransferCapital > 0, the AVD starts with the transferred Riester
  // capital (minus transfer costs) instead of zero. Not a taxable sale (AltZertG transfer).
  const transferInitialCapital =
    avd.riesterTransferCapital > 0
      ? Math.max(0, avd.riesterTransferCapital - avd.transferCostEUR)
      : undefined

  return buildProductResult({
    productId: 'altersvorsorgedepot',
    label: avd.riesterTransferCapital > 0
      ? 'Altersvorsorgedepot (Riester-Übertrag)'
      : metadata.label,
    scenario: { ...scenario, annualReturn: baseReturn },
    profile,
    rules,
    assumptions,
    monthlyUserCost: altersvorsorgedepotFunding.monthlyNetCost,
    monthlyProductContribution: avdMonthlyContribution,
    monthlyEmployerContribution: 0,
    fees: avd.fees,
    yearlyReturnFn,
    initialCapital: transferInitialCapital,
    taxAndSvSavings:
      (altersvorsorgedepotFunding.totalAllowanceAnnual +
        altersvorsorgedepotFunding.guenstigerpruefungBenefitAnnual) * yearsToRetirement,
    buildPayout: ({ projection, payoutReturn }) => {
      const partialPct = Math.min(avd.partialCapitalPct, rules.altersvorsorgedepot.partialCapitalMaxPct)
      const monthlyCapital = projection.capital * (1 - partialPct)
      const grossMonthlyPayout =
        avd.payoutMode === 'lifelong_annuity'
          ? (monthlyCapital / 10_000) * avd.rentenfaktor
          : monthlyPayoutFromCapital(
              monthlyCapital,
              payoutReturn,
              Math.max(avd.payoutPlanEndAge, rules.altersvorsorgedepot.payoutPlanMinEndAge) -
                profile.retirementAge,
            )
      const partialCapital = projection.capital * partialPct - avd.transferCostEUR
      const otherAnnual = avd.monthlyOtherRetirementIncome * 12

      return {
        afterTaxLumpSum: partialPct > 0
          ? afterTaxAvdLumpSum(
              Math.max(0, partialCapital),
              profile,
              rules,
              otherAnnual,
              payoutYear,
              ctx.grvGrossMonthlyPension,
            )
          : null,
        grossMonthlyPayout,
        netMonthlyPayout: netAvdPayout(
          grossMonthlyPayout,
          profile,
          rules,
          avd.monthlyOtherRetirementIncome,
          payoutYear,
          ctx.grvGrossMonthlyPension,
          ctx.retirementHealthStatus,
        ),
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          avd.payoutMode === 'lifelong_annuity',
        ),
      }
    },
  })
}
