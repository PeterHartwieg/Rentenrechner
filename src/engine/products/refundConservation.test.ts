import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules as rules } from '../../rules/de2026'
import { simulateRetirementComparison } from '../simulate'

const fees = { wrapperAssetFee: 0, fundAssetFee: 0, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, acquisitionCostSpreadYears: 1, pensionPayoutFeePct: 0 }

describe('certified pension refund cash conservation', () => {
  for (const product of ['riester', 'altersvorsorgedepot'] as const) {
    for (const ownMonthly of [100, 150, 1000]) {
      it(`${product}: retains the refund without investing it again (${ownMonthly} EUR/month)`, () => {
        const assumptions = structuredClone(defaultAssumptions)
        assumptions.visibleProducts = [product]
        assumptions.returnScenarios = [{ id: 'basis', label: 'zero', annualReturn: 0 }]
        assumptions[product].monthlyOwnContribution = ownMonthly
        assumptions[product].fees = fees
        assumptions.riester.existingCapital = 0
        assumptions.altersvorsorgedepot.lowRiskAnnualReturn = 0
        const simulation = simulateRetirementComparison({ ...defaultProfile, age: 66, retirementAge: 67 }, assumptions, rules)
        const funding = product === 'riester' ? simulation.riesterFunding : simulation.altersvorsorgedepotFunding
        const result = simulation.products[0]
        expect(funding.guenstigerpruefungBenefitAnnual).toBeGreaterThan(0)
        // Refund returns to the household; allowance flows into the contract.
        // Funding currently reports requested user cost even above the AVD cap.
        // Keep that separate limitation explicit while checking accepted cash flow.
        const rejectedContribution = product === 'altersvorsorgedepot'
          ? Math.max(0, ownMonthly * 12 + funding.totalAllowanceAnnual - rules.altersvorsorgedepot.contractContributionCapAnnual)
          : 0
        expect(result.totalProductContributions + rejectedContribution).toBeCloseTo(result.totalUserCost + funding.guenstigerpruefungBenefitAnnual + funding.totalAllowanceAnnual, 8)
        expect(result.monthlyProductContribution * 12).toBeCloseTo(result.totalProductContributions, 8)
        expect(result.capitalAtRetirement).toBeCloseTo(result.totalProductContributions, 8)
        if (product === 'altersvorsorgedepot') {
          expect(result.totalProductContributions).toBeLessThanOrEqual(rules.altersvorsorgedepot.contractContributionCapAnnual)
        }
      })
    }
    it(`${product}: guarantee covers only accepted contributions and allowances`, () => {
      const assumptions = structuredClone(defaultAssumptions)
      assumptions.visibleProducts = [product]
      assumptions.returnScenarios = [{ id: 'basis', label: 'loss', annualReturn: -0.5 }]
      assumptions[product].monthlyOwnContribution = 150
      assumptions[product].fees = fees
      assumptions.riester.existingCapital = 0
      assumptions.riester.capitalGuarantee = { enabled: true, floorPctOfContributions: 1 }
      assumptions.altersvorsorgedepot.subtype = 'guarantee_100'
      assumptions.altersvorsorgedepot.riskAllocationPct = 1
      const simulation = simulateRetirementComparison({ ...defaultProfile, age: 66, retirementAge: 67 }, assumptions, rules)
      const funding = product === 'riester' ? simulation.riesterFunding : simulation.altersvorsorgedepotFunding
      const result = simulation.products[0]
      const acceptedInflow = funding.monthlyOwnContribution * 12 + funding.totalAllowanceAnnual
      expect(funding.guenstigerpruefungBenefitAnnual).toBeGreaterThan(0)
      expect(result.capitalAtRetirement).toBeCloseTo(acceptedInflow, 8)
    })
  }
})
