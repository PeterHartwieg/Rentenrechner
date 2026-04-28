import type { ProductResult, ReturnScenario } from '../../domain/types'
import type { SimulationContext } from '../simulationContext'
import { buildProductResult } from '../buildResult'
import { computeAvdGlidepathReturn } from '../altersvorsorgedepot'

export const metadata = {
  id: 'altersvorsorgedepot' as const,
  label: 'Altersvorsorgedepot (Schicht 2, 2027)',
  shortLabel: 'AVD',
  color: '#0e7490',
  order: 4,
  lockedCapital: true,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): ProductResult {
  const { profile, assumptions, rules, bavFunding, altersvorsorgedepotFunding, payoutYear, yearsToRetirement } = ctx
  const avd = assumptions.altersvorsorgedepot

  // Total monthly contribution = own contribution + state allowances flowing in each month.
  const avdMonthlyContribution =
    altersvorsorgedepotFunding.monthlyOwnContribution +
    altersvorsorgedepotFunding.totalAllowanceAnnual / 12

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
      ? 'Altersvorsorgedepot (Schicht 2, Riester-Übertrag)'
      : metadata.label,
    scenario: { ...scenario, annualReturn: baseReturn },
    profile,
    rules,
    assumptions,
    bavFunding,
    avdFunding: altersvorsorgedepotFunding,
    monthlyUserCost: altersvorsorgedepotFunding.monthlyNetCost,
    monthlyProductContribution: avdMonthlyContribution,
    monthlyEmployerContribution: 0,
    fees: avd.fees,
    taxMode: 'altersvorsorgedepot',
    retirementYear: payoutYear,
    yearlyReturnFn,
    initialCapital: transferInitialCapital,
  })
}
