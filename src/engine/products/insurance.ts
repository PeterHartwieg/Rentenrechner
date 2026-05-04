import type { FeeModel, InsurancePaidUpScenario, InsuranceProductResult, ReturnScenario } from '../../domain'
import type { SimulationContext } from '../simulationContext'
import {
  buildProductResult,
} from '../buildResult'
import {
  afterTaxInsuranceLumpSum,
  insuranceLumpSumBreakdown,
  netInsurancePayout,
} from '../insurancePayout'
import {
  calculateLeibrenteBreakEvenAge,
  computeFeeAdjustedGrossMonthlyPayout,
} from '../productPayout'
import {
  projectAccumulation,
} from '../accumulation'
import { marketReturnPolicy, withMarketReturnPolicy } from '../marketReturns'

export const metadata = {
  id: 'versicherung' as const,
  label: 'Private Rentenversicherung',
  shortLabel: 'Private Rente',
  color: '#b45309',
  order: 2,
  lockedCapital: false,
  hasFees: true,
  hasEmployerContribution: false,
}

export function simulate(ctx: SimulationContext, scenario: ReturnScenario): InsuranceProductResult {
  const { profile, assumptions, rules, bavFunding, insuranceTaxMode, payoutYear } = ctx
  const ins = assumptions.insurance
  // Combine-mode (`simulatePortfolio`) sets `insuranceMonthlyUserCostOverride` per
  // instance so each insurance contract honors its own `monthlyContribution`.
  // Compare-mode leaves this undefined → fair-comparison invariant: insurance
  // invests `bavFunding.monthlyNetCost` (see CLAUDE.md "Non-obvious architecture").
  const insuranceMonthly = ctx.insuranceMonthlyUserCostOverride ?? bavFunding.monthlyNetCost
  const guaranteePct = ins.capitalGuarantee.enabled ? ins.capitalGuarantee.floorPctOfContributions : 0

  const insResult = buildProductResult({
    productId: 'versicherung',
    label: metadata.label,
    scenario,
    profile,
    rules,
    assumptions,
    monthlyUserCost: insuranceMonthly,
    monthlyProductContribution: insuranceMonthly,
    monthlyEmployerContribution: 0,
    fees: ins.fees,
    guarantee:
      guaranteePct > 0
        ? {
            label: `${Math.round(guaranteePct * 100)}% Beitragsgarantie`,
            floorCapital: (projection) => projection.totalProductContributions * guaranteePct,
          }
        : undefined,
    policy: withMarketReturnPolicy(
      ctx,
      scenario,
      ins.annualContributionGrowthRate
        ? { contributionGrowth: { annualRate: ins.annualContributionGrowthRate } }
        : undefined,
    ),
    buildPayout: ({ projection, payoutYears, payoutReturn }) => {
      const grossMonthlyPayout = computeFeeAdjustedGrossMonthlyPayout(
        projection.capital,
        {
          mode: ins.payoutMode,
          rentenfaktor: ins.rentenfaktor,
          zeitrenteYears: ins.zeitrenteYears,
          kapitalverzehrYears: payoutYears,
          payoutReturn,
        },
        ins.fees,
      )
      const kvdrMember = assumptions.bav.kvdrMember !== false
      const otherAnnual = ins.monthlyOtherRetirementIncome * 12
      const lumpSum = insuranceLumpSumBreakdown(
        projection.capital,
        projection.totalContributionsBeforeFees,
        insuranceTaxMode,
        rules,
        otherAnnual,
        payoutYear,
        profile,
        kvdrMember,
        ctx.grvGrossMonthlyPension,
      )
      const netMonthlyPayout = netInsurancePayout(
        grossMonthlyPayout,
        projection.capital,
        projection.totalContributionsBeforeFees,
        insuranceTaxMode,
        rules,
        ins.monthlyOtherRetirementIncome,
        payoutYear,
        profile,
        kvdrMember,
        ins.payoutMode,
        profile.retirementAge,
        ctx.grvGrossMonthlyPension,
      )

      return {
        afterTaxLumpSum: lumpSum.net,
        lumpSumDeductions: { incomeTax: lumpSum.incomeTax, kvPv: lumpSum.kvPv },
        grossMonthlyPayout,
        netMonthlyPayout,
        leibrenteBreakEvenAge: calculateLeibrenteBreakEvenAge(
          profile.retirementAge,
          projection.capital,
          grossMonthlyPayout,
          ins.payoutMode === 'leibrente',
        ),
        payoutEndAge:
          ins.payoutMode === 'leibrente'
            ? undefined
            : ins.payoutMode === 'zeitrente'
              ? profile.retirementAge + ins.zeitrenteYears
              : assumptions.retirementEndAge,
      }
    },
  })

  // #65: compute paid-up / surrender scenario when paidUpAge is configured.
  const paidUpAge = ins.paidUpAge
  let paidUpScenario: InsurancePaidUpScenario | undefined
  if (paidUpAge !== undefined && paidUpAge > profile.age && paidUpAge < profile.retirementAge) {
    const paidUpPhase1Policy =
      ins.annualContributionGrowthRate || ctx.marketReturnPath
        ? {
            contributionGrowth: ins.annualContributionGrowthRate
              ? { annualRate: ins.annualContributionGrowthRate }
              : undefined,
            yearlyReturn: marketReturnPolicy(ctx, scenario),
          }
        : undefined

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
      policy: paidUpPhase1Policy,
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
      policy: {
        initialCapital: capitalAtPaidUp,
        yearlyReturn: marketReturnPolicy(ctx, scenario, paidUpAge - profile.age),
      },
    })

    const retirementCapital = phase2.capital
    const payoutYears = assumptions.retirementEndAge - profile.retirementAge
    const payoutReturn = scenario.annualReturn - (ins.fees.wrapperAssetFee + ins.fees.fundAssetFee)

    const grossMonthlyPayout = computeFeeAdjustedGrossMonthlyPayout(
      retirementCapital,
      {
        mode: ins.payoutMode,
        rentenfaktor: ins.rentenfaktor,
        zeitrenteYears: ins.zeitrenteYears,
        kapitalverzehrYears: payoutYears,
        payoutReturn,
      },
      ins.fees,
    )

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
      ctx.grvGrossMonthlyPension,
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
      ctx.grvGrossMonthlyPension,
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

  return { ...insResult, paidUpScenario }
}
