import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../../data/defaultScenario'
import { de2026Rules as rules } from '../../rules/de2026'
import { simulateRetirementComparison } from '../simulate'
import { simulatePortfolio } from '../portfolioAdapter'
import { migrateV1ToV2 } from '../../storage'

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
        expect(result.totalProductContributions).toBeCloseTo(result.totalUserCost + funding.guenstigerpruefungBenefitAnnual + funding.totalAllowanceAnnual, 8)
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


describe('AVD accepted contribution cost in combine mode', () => {
  for (const ownMonthly of [150, 1000]) {
    it(`charges only accepted own contributions (${ownMonthly} EUR requested)`, () => {
      const workspace = migrateV1ToV2(
        { ...defaultProfile, age: 66, retirementAge: 67, childBirthYears: [] },
        { ...structuredClone(defaultAssumptions) },
      )
      const assumptions = workspace.baseline.assumptions
      assumptions.bav = []; assumptions.etf = []; assumptions.insurance = []
      assumptions.basisrente = []; assumptions.riester = []
      assumptions.returnScenarios = [{ id: 'basis', label: 'zero', annualReturn: 0 }]
      const instance = assumptions.altersvorsorgedepot[0]
      Object.assign(instance, { monthlyOwnContribution: ownMonthly, fees, lowRiskAnnualReturn: 0, riskAllocationPct: 1, subtype: 'depot_no_guarantee', currentValueEUR: 0, riesterTransferCapital: 0 })
      Object.assign(instance.eligibility, { directlyEligible: true, indirectSpouseEligible: false, eligibleChildren: 0, careerStarterBonusUsed: true })
      const simulation = simulatePortfolio(workspace, rules)
      const funding = simulation.portfolioFunding.altersvorsorgedepotByInstanceId[instance.instanceId]
      const result = simulation.perInstance[instance.instanceId][0]
      const acceptedOwn = ownMonthly === 150 ? 1800 : 6300
      expect(funding.annualOwnContribution).toBeCloseTo(acceptedOwn, 8)
      expect(funding.monthlyOwnContribution * 12).toBeCloseTo(acceptedOwn, 8)
      expect(funding.totalAllowanceAnnual).toBeCloseTo(540, 8)
      const headroom = simulation.portfolioFunding.headroom.altersvorsorgedepotByInstanceId[instance.instanceId]
      expect(headroom.requestedAnnual).toBeCloseTo(ownMonthly * 12 + 540, 8)
      expect(headroom.fundedAnnual).toBeCloseTo(acceptedOwn + 540, 8)
      expect(headroom.constrained).toBe(ownMonthly === 1000)
      expect(result.totalUserCost).toBeCloseTo(acceptedOwn - funding.guenstigerpruefungBenefitAnnual, 8)
      expect(result.totalProductContributions).toBeCloseTo(result.totalUserCost + funding.guenstigerpruefungBenefitAnnual + funding.totalAllowanceAnnual, 8)
      expect(result.capitalAtRetirement).toBeCloseTo(acceptedOwn + 540, 8)
    })
  }
})
