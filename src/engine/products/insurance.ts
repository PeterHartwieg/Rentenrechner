import type { FeeModel, InsurancePaidUpScenario, InsuranceProductResult, ReturnScenario } from '../../domain/types'
import type { SimulationContext } from '../simulationContext'
import { buildProductResult } from '../buildResult'
import {
  afterTaxInsuranceLumpSum,
  computeGrossMonthlyPayout,
  netInsurancePayout,
  projectAccumulation,
} from '../projections'

export const metadata = {
  id: 'versicherung' as const,
  label: 'Private Rentenversicherung (Schicht 3)',
  shortLabel: 'pAV',
  color: '#b45309',
  order: 2,
  lockedCapital: false,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): InsuranceProductResult {
  const { profile, assumptions, rules, bavFunding, insuranceTaxMode, payoutYear } = ctx
  const ins = assumptions.insurance
  const insuranceMonthly = bavFunding.monthlyNetCost

  const insResult = buildProductResult({
    productId: 'versicherung',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    bavFunding,
    monthlyUserCost: insuranceMonthly,
    monthlyProductContribution: insuranceMonthly,
    monthlyEmployerContribution: 0,
    fees: ins.fees,
    taxMode: insuranceTaxMode,
    retirementYear: payoutYear,
  }) as InsuranceProductResult

  // #65: compute paid-up / surrender scenario when paidUpAge is configured.
  const paidUpAge = ins.paidUpAge
  let paidUpScenario: InsurancePaidUpScenario | undefined
  if (paidUpAge !== undefined && paidUpAge > profile.age && paidUpAge < profile.retirementAge) {
    // Phase 1: accumulate with contributions from current age to paidUpAge.
    const phase1 = projectAccumulation({
      productId: 'versicherung',
      currentAge: profile.age,
      months: (paidUpAge - profile.age) * 12,
      monthlyUserCost: insuranceMonthly,
      monthlyProductContribution: insuranceMonthly,
      monthlyEmployerContribution: 0,
      annualReturn: scenario.annualReturn,
      inflationRate: assumptions.inflationRate,
      scenario,
      fees: ins.fees,
    })

    const capitalAtPaidUp = phase1.capital
    const surrenderValue = capitalAtPaidUp * (1 - ins.surrenderHaircutPct)

    // Phase 2: paid-up continuation — no contributions; only ongoing asset fees remain.
    const paidUpFees: FeeModel = {
      wrapperAssetFee: ins.fees.wrapperAssetFee,
      fundAssetFee: ins.fees.fundAssetFee,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 1,
      pensionPayoutFeePct: ins.fees.pensionPayoutFeePct,
    }
    const phase2 = projectAccumulation({
      productId: 'versicherung',
      currentAge: paidUpAge,
      months: (profile.retirementAge - paidUpAge) * 12,
      monthlyUserCost: 0,
      monthlyProductContribution: 0,
      monthlyEmployerContribution: 0,
      annualReturn: scenario.annualReturn,
      inflationRate: assumptions.inflationRate,
      scenario,
      fees: paidUpFees,
      initialCapital: capitalAtPaidUp,
    })

    const retirementCapital = phase2.capital
    const payoutYears = assumptions.retirementEndAge - profile.retirementAge
    const payoutReturn = scenario.annualReturn - (ins.fees.wrapperAssetFee + ins.fees.fundAssetFee)

    let grossMonthlyPayout = computeGrossMonthlyPayout(retirementCapital, {
      mode: ins.payoutMode,
      rentenfaktor: ins.rentenfaktor,
      zeitrenteYears: ins.zeitrenteYears,
      kapitalverzehrYears: payoutYears,
      payoutReturn,
    })
    if (ins.fees.pensionPayoutFeePct > 0) {
      grossMonthlyPayout = grossMonthlyPayout * (1 - ins.fees.pensionPayoutFeePct)
    }

    const kvdrMember = assumptions.bav.kvdrMember !== false
    const otherAnnual = ins.monthlyOtherRetirementIncome * 12

    const afterTaxLumpSum = afterTaxInsuranceLumpSum(
      retirementCapital,
      phase1.totalContributionsBeforeFees,
      insuranceTaxMode,
      rules,
      otherAnnual,
      payoutYear,
      profile,
      kvdrMember,
    )

    const netMonthlyPayout = netInsurancePayout(
      grossMonthlyPayout,
      retirementCapital,
      phase1.totalContributionsBeforeFees,
      insuranceTaxMode,
      rules,
      ins.monthlyOtherRetirementIncome,
      payoutYear,
      profile,
      kvdrMember,
      ins.payoutMode,
      profile.retirementAge,
    )

    paidUpScenario = {
      paidUpAge,
      capitalAtPaidUp,
      feesAtPaidUp: phase1.totalFees,
      surrenderValue,
      retirementCapital,
      grossMonthlyPayout,
      netMonthlyPayout,
      afterTaxLumpSum,
    }
  }

  return { ...insResult, paidUpScenario } as InsuranceProductResult
}
