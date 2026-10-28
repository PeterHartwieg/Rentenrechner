import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { de2026Rules as rules } from '../rules/de2026'
import { migrateV1ToV2, buildWorkspaceJson, parseWorkspaceJson, buildStateJson, parseStateFromJson } from '../storage'
import { buildPortfolioFunding } from './portfolioFunding'
import { calculateRiesterHouseholdFunding, riesterHouseholdInputIssues } from './riesterHousehold'
import { calculateRiesterFunding, solveRiesterOwnFromNet } from './riester'
import { calculateSalaryResult } from './salary'
import { calculateSalaryPhaseTaxDelta } from './salaryPhaseFunding'
import type { RiesterInstance } from '../domain/instances'
import { forkBaselineScenario, applyWhatIfToBaseline, rebaseWhatIf } from '../app/portfolioState'
import { scenarioDiff } from '../app/scenarioDiff'
import { buildGeneratorContext } from '../app/recommenderCandidates/testHelpers'
import { makeRiesterTopUpCandidate } from '../app/recommenderCandidates/riester'

export function spouseFixture(gross = 50000, partnerGross = 30000, indirect = false, kids = 0) {
  const profile = { ...defaultProfile, age: 37, retirementAge: 67, grossSalaryYear: gross,
    taxClass: 3 as const, churchTax: false, childBirthYears: [2016, 2019].slice(0, kids) }
  const ws = migrateV1ToV2(profile, { ...structuredClone(defaultAssumptions) })
  ws.baseline.partner = { ...profile, grossSalaryYear: partnerGross, taxClass: indirect ? 5 : 4 }
  const a = ws.baseline.assumptions
  a.bav = []; a.etf = []; a.insurance = []; a.basisrente = []; a.altersvorsorgedepot = []
  a.riester = [false, true].map((partner): RiesterInstance => ({
    ...structuredClone(defaultAssumptions.riester),
    instanceId: partner ? 'riester-partner' : 'riester-self', ownedBy: partner ? 'partner' : 'self',
    label: 'Riester', status: 'active', contractStartYear: 2026, evidenceMap: {},
    monthlyOwnContribution: (partner && indirect ? 60 : Math.max(60,
      Math.min(0.04 * (partner ? partnerGross : gross), 2100) -
      (partner ? 175 + kids * 300 : indirect ? 350 + kids * 300 : 175))) / 12,
    eligibility: { directlyEligible: !(partner && indirect), indirectSpouseEligible: partner && indirect,
      claimsChildAllowance: partner, careerStarterBonusUsed: true, ageAtContractStart: 37 },
  }))
  return ws
}

describe('memo #420: owner-aware legacy Riester funding', () => {
  it('review round 1: the indirect recipient must qualify on its own contract', () => {
    const ws = spouseFixture(50000, 0, true)
    const paid = ws.baseline.assumptions.riester[1]
    paid.instanceId = 'z-paid'; paid.expectedReturn = 0.03
    ws.baseline.assumptions.riester.push({ ...paid, instanceId: 'a-empty', monthlyOwnContribution: 0, expectedReturn: 0.07 })
    const f = buildPortfolioFunding(ws, rules)
    expect(f.riesterByInstanceId['a-empty'].totalAllowanceAnnual).toBe(0)
    expect(f.riesterByInstanceId['a-empty'].section10aEligible).toBe(false)
    expect(f.riesterByInstanceId['z-paid'].totalAllowanceAnnual).toBe(175)
    expect(f.riesterByInstanceId['z-paid'].section10aEligible).toBe(true)
  })
  it.each([0, 59])('review round 1: candidate reaches the indirect minimum from EUR %s', (annual) => {
    const ws = spouseFixture(50000, 0, true)
    const [direct, indirect] = ws.baseline.assumptions.riester
    direct.monthlyOwnContribution = 1925 / 12
    indirect.monthlyOwnContribution = annual / 12
    ws.baseline.assumptions.riester = [indirect, direct]
    const context = buildGeneratorContext(ws, 100)
    expect(context.portfolioFunding.headroom.riester.remainingAnnual).toBeCloseTo(60 - annual, 6)
    const candidate = makeRiesterTopUpCandidate(context)
    expect(candidate).not.toBeNull()
    expect(candidate!.grossMonthlyEUR * 12).toBeCloseTo(60 - annual, 6)
    indirect.monthlyOwnContribution += candidate!.grossMonthlyEUR
    expect(buildPortfolioFunding(ws, rules).riesterByInstanceId[indirect.instanceId].totalAllowanceAnnual).toBe(175)
  })
  it('review round 1: cap follows direct person eligibility even with an unfunded direct contract', () => {
    const ws = spouseFixture(50000, 0, true)
    ws.baseline.assumptions.riester[0].fundingEligible = false
    const f = buildPortfolioFunding(ws, rules)
    expect(f.headroom.riester.capAnnual).toBe(2160)
    expect(f.headroom.riester.fundedAnnual).toBe(60)
    expect(f.riesterByInstanceId['riester-self'].section10aEligible).toBe(false)
    // No allowance with an underpaid direct spouse, but indirect deduction eligibility remains.
    expect(f.riesterByInstanceId['riester-partner'].section10aEligible).toBe(true)
  })
  it('review round 1: allowance-only recipient still enters the requested total', () => {
    const ws = spouseFixture()
    ws.baseline.partner = undefined
    const direct = ws.baseline.assumptions.riester[0]
    ws.baseline.assumptions.riester = [
      { ...direct, instanceId: 'a-empty', monthlyOwnContribution: 0 },
      { ...direct, instanceId: 'z-paid', monthlyOwnContribution: 175 },
    ]
    const f = buildPortfolioFunding(ws, rules)
    expect(f.headroom.riester.requestedAnnual).toBe(2275)
    expect(f.headroom.riester.constrained).toBe(true)
  })
  it('review round 1: assessment survives unchanged forks and preview/rebase/apply', () => {
    const ws = spouseFixture()
    ws.baseline.riesterJointAssessment = false
    const fork = forkBaselineScenario(ws.baseline, 'Alternative')
    expect(fork.riesterJointAssessment).toBe(false)
    expect(scenarioDiff(ws.baseline, fork)).toEqual([])
    expect(buildPortfolioFunding({ ...ws, baseline: fork }, rules).riesterByInstanceId)
      .toEqual(buildPortfolioFunding(ws, rules).riesterByInstanceId)
    fork.riesterJointAssessment = true
    expect(scenarioDiff(ws.baseline, fork)).toContainEqual({ fieldPath: 'riesterJointAssessment', oldValue: false, newValue: true })
    const rebased = rebaseWhatIf(fork, ws.baseline)
    const applied = applyWhatIfToBaseline(rebased, ws.baseline)
    expect(applied.riesterJointAssessment).toBe(true)
    expect(buildPortfolioFunding({ ...ws, baseline: applied }, rules).riesterByInstanceId)
      .toEqual(buildPortfolioFunding({ ...ws, baseline: fork }, rules).riesterByInstanceId)
  })
  it('review round 1: expired children and unfunded indirect contracts do not block readiness', () => {
    const ws = spouseFixture()
    ws.baseline.profile.childBirthYears = [1990]
    ws.baseline.assumptions.riester.forEach(r => { r.eligibility.claimsChildAllowance = true })
    expect(riesterHouseholdInputIssues(ws.baseline, rules.year)).toEqual([])
    ws.baseline.profile.childBirthYears = [2020]
    expect(riesterHouseholdInputIssues(ws.baseline, rules.year)).toHaveLength(1)
    ws.baseline.assumptions.riester = [{ ...ws.baseline.assumptions.riester[0], fundingEligible: false,
      eligibility: { ...ws.baseline.assumptions.riester[0].eligibility, directlyEligible: false, indirectSpouseEligible: true } }]
    expect(riesterHouseholdInputIssues(ws.baseline, rules.year)).toEqual([])
  })
  it('keeps the indirect eligibility minimum separate from the direct allowance minimum', () => {
    const ws = spouseFixture(50000, 0, true)
    const changedSockel = { ...rules, riester: { ...rules.riester, sockelbetrag: 100 } }
    expect(buildPortfolioFunding(ws, changedSockel).riesterByInstanceId['riester-partner'].totalAllowanceAnnual).toBe(175)
    const changedEligibility = { ...rules, riester: { ...rules.riester, indirectEligibilityMinimumAnnual: 100 } }
    expect(buildPortfolioFunding(ws, changedEligibility).riesterByInstanceId['riester-partner'].totalAllowanceAnnual).toBe(0)
  })
  it('respects the owner tag when the directly eligible spouse is the partner', () => {
    const ws = spouseFixture(50000, 0, true)
    const before = buildPortfolioFunding(ws, rules)
    const self = ws.baseline.profile
    ws.baseline.profile = ws.baseline.partner!
    ws.baseline.partner = self
    ws.baseline.assumptions.riester.forEach(r => { r.ownedBy = r.ownedBy === 'self' ? 'partner' : 'self' })
    expect(buildPortfolioFunding(ws, rules).riesterYearlyByInstanceId).toEqual(before.riesterYearlyByInstanceId)
  })
  it('BMF Rn. 103/120: considers 1700 direct and only 110 indirect, splitting the refund 1700:110', () => {
    const ws = spouseFixture(100000, 0, true)
    const entries = ws.baseline.assumptions.riester.map((contract, i) => ({
      instanceId: contract.instanceId, ownedBy: contract.ownedBy,
      contract: { ...contract, monthlyOwnContribution: (i ? 250 : 1700) / 12,
        eligibility: { ...contract.eligibility, priorYearRelevantIncome: 50000 } },
    }))
    const result = calculateRiesterHouseholdFunding(entries, {
      self: { profile: ws.baseline.profile, salary: calculateSalaryResult(ws.baseline.profile, rules) },
      partner: { profile: ws.baseline.partner!, salary: calculateSalaryResult(ws.baseline.partner!, rules) },
    }, rules, { jointTaxableIncome: 150000 })
    const [self, partner] = Object.values(result)
    expect(self.specialExpenseDeductibleAnnual).toBe(1875)
    expect(partner.specialExpenseDeductibleAnnual).toBe(285)
    // BMF's 558 EUR refund uses the historical tariff. Use the current 2026
    // tax helper for the refund, while independently pinning the legal shares.
    const refund = calculateSalaryPhaseTaxDelta(rules, 150000, 2160, 'married').taxSavingAnnual - 350
    expect(self.guenstigerpruefungBenefitAnnual).toBeCloseTo(refund * 1700 / 1810, 8)
    expect(partner.guenstigerpruefungBenefitAnnual).toBeCloseTo(refund * 110 / 1810, 8)
  })
  it('a 60 EUR indirect payment does not cure direct-spouse underpayment', () => {
    const ws = spouseFixture(50000, 0, true)
    ws.baseline.assumptions.riester.forEach(r => { r.monthlyOwnContribution = 5 })
    const f = Object.values(buildPortfolioFunding(ws, rules).riesterByInstanceId)
    expect(f.reduce((s, x) => s + x.totalAllowanceAnnual, 0)).toBeCloseTo(350 * 60 / 1650, 8)
    expect(f.reduce((s, x) => s + x.monthlyNetCost * 12 + x.guenstigerpruefungBenefitAnnual, 0)).toBeCloseTo(120, 8)
  })
  it('separate assessment uses each income independently; unused direct cap is not transferable', () => {
    const ws = spouseFixture()
    ws.baseline.riesterJointAssessment = false
    let f = Object.values(buildPortfolioFunding(ws, rules).riesterByInstanceId)
    expect(f.reduce((s, x) => s + x.guenstigerpruefungBenefitAnnual, 0)).toBe(573)
    ws.baseline.assumptions.riester[0].monthlyOwnContribution = 500
    ws.baseline.assumptions.riester[1].monthlyOwnContribution = 0
    f = Object.values(buildPortfolioFunding(ws, rules).riesterByInstanceId)
    expect(f[0].specialExpenseDeductibleAnnual).toBe(2100)
    expect(f[1].specialExpenseDeductibleAnnual).toBe(0)
    expect(f[0].annualOwnContribution).toBe(6000)
  })
  it('retains owner facts, eligibility and assessment through storage and yearly child expiry', () => {
    const ws = spouseFixture(50000, 30000, false, 1)
    ws.baseline.riesterJointAssessment = false
    ws.baseline.assumptions.riester[0].eligibility.priorYearRelevantIncome = 42000
    const restored = parseWorkspaceJson(buildWorkspaceJson(ws))!
    expect(restored.baseline.assumptions.riester).toEqual(ws.baseline.assumptions.riester)
    expect(restored.baseline.riesterJointAssessment).toBe(false)
    const f = buildPortfolioFunding(restored, rules)
    expect(f.riesterYearlyByInstanceId['riester-partner'][15].childAllowanceAnnual).toBe(0)
    const reversed = structuredClone(restored)
    reversed.baseline.assumptions.riester.reverse()
    expect(buildPortfolioFunding(reversed, rules).riesterYearlyByInstanceId).toEqual(f.riesterYearlyByInstanceId)
  })
  it('contract qualification is independent of consistent person eligibility', () => {
    const ws = spouseFixture()
    ws.baseline.partner = undefined
    ws.baseline.profile.taxClass = 1
    ws.baseline.assumptions.riester.forEach(r => { r.ownedBy = 'self'; r.monthlyOwnContribution = 75 })
    ws.baseline.assumptions.riester[1].fundingEligible = false
    expect(riesterHouseholdInputIssues(ws.baseline)).toEqual([])
    const f = buildPortfolioFunding(ws, rules).riesterByInstanceId
    expect(f['riester-self'].guenstigerpruefungBenefitAnnual).toBeCloseTo(219.6986301369863, 6)
    expect(f['riester-partner'].monthlyNetCost).toBe(75)
    ws.baseline.assumptions.riester[0].fundingEligible = false
    expect(Object.values(buildPortfolioFunding(ws, rules).riesterByInstanceId).every(x => x.specialExpenseDeductibleAnnual === 0 && x.totalAllowanceAnnual === 0)).toBe(true)
  })
  it('compare-mode spouse funding and inverse solving share the household calculation', () => {
    const ws = spouseFixture(50000, 0, true)
    const salary = calculateSalaryResult(ws.baseline.profile, rules)
    const [self, partner] = ws.baseline.assumptions.riester
    const contract = { ...self, spouse: {
      grossSalaryYear: 0, taxableIncomeAnnual: 0, monthlyOwnContribution: 5,
      eligibility: partner.eligibility, jointAssessment: true,
    } }
    const f = calculateRiesterFunding(rules, salary, contract, ws.baseline.profile)
    expect(f.totalAllowanceAnnual).toBe(175)
    expect(f.guenstigerpruefungBenefitAnnual).toBeCloseTo(150 * 1650 / 1710, 8)
    const own = solveRiesterOwnFromNet(f.monthlyNetCost, rules, salary, contract, ws.baseline.profile)
    expect(calculateRiesterFunding(rules, salary, { ...contract, monthlyOwnContribution: own }, ws.baseline.profile).monthlyNetCost).toBeCloseTo(f.monthlyNetCost, 1)
    const assumptions = { ...defaultAssumptions, riester: contract }
    const restored = parseStateFromJson(buildStateJson(ws.baseline.profile, assumptions))!
    expect(restored.assumptions.riester.spouse).toEqual(contract.spouse)
  })
  it.each([
    [50000, 30000, false, 0, 550, 350],
    [100000, 60000, false, 0, 1318, 350],
    [50000, 30000, false, 1, 254, 650],
    [50000, 0, true, 0, 150, 350],
    [50000, 0, true, 1, 0, 650],
    [100000, 0, true, 0, 336, 350],
  ])('%s + %s, indirect=%s children=%s', (gross, partnerGross, indirect, kids, refund, allowance) => {
    const ws = spouseFixture(gross as number, partnerGross as number, indirect as boolean, kids as number)
    const f = Object.values(buildPortfolioFunding(ws, rules).riesterByInstanceId)
    expect(f.reduce((s, x) => s + x.guenstigerpruefungBenefitAnnual, 0)).toBeCloseTo(refund as number, 6)
    expect(f.reduce((s, x) => s + x.totalAllowanceAnnual, 0)).toBeCloseTo(allowance as number, 6)
    expect(f.map(x => x.annualOwnContribution)).toEqual(ws.baseline.assumptions.riester.map(x => x.monthlyOwnContribution * 12))
  })
  it.each([[59, 307.3972602739726, 172.6027397260274], [59.99, 307.3972602739726, 172.6027397260274], [60, 174, 350]])('indirect own payment %s', (own, refund, allowance) => {
    const ws = spouseFixture(50000, 0, true)
    ws.baseline.assumptions.riester[0].monthlyOwnContribution = 150
    ws.baseline.assumptions.riester[1].monthlyOwnContribution = own / 12
    const f = Object.values(buildPortfolioFunding(ws, rules).riesterByInstanceId)
    expect(f.reduce((s, x) => s + x.guenstigerpruefungBenefitAnnual, 0)).toBeCloseTo(refund, 6)
    expect(f.reduce((s, x) => s + x.totalAllowanceAnnual, 0)).toBeCloseTo(allowance, 6)
    if (own < 60) expect(f[1].specialExpenseDeductibleAnnual).toBe(0)
  })
  it('excludes ineligible payments upstream, preserving their full net cost', () => {
    const ws = spouseFixture()
    ws.baseline.partner = undefined
    ws.baseline.profile.taxClass = 1
    for (const r of ws.baseline.assumptions.riester) { r.monthlyOwnContribution = 75; r.ownedBy = 'self' }
    ws.baseline.assumptions.riester[1].eligibility.directlyEligible = false
    const f = buildPortfolioFunding(ws, rules).riesterByInstanceId
    expect(f['riester-self'].guenstigerpruefungBenefitAnnual).toBeCloseTo(219.6986301369863, 6)
    expect(f['riester-self'].totalAllowanceAnnual).toBeCloseTo(86.3013698630137, 6)
    expect(f['riester-partner'].guenstigerpruefungBenefitAnnual).toBe(0)
    expect(f['riester-partner'].specialExpenseDeductibleAnnual).toBe(0)
    expect(f['riester-partner'].monthlyNetCost).toBe(75)
  })
  it('equal eligible payments keep equal refund shares and conserve cash across every year', () => {
    const ws = spouseFixture(50000, 30000, false, 1)
    ws.baseline.partner = undefined
    ws.baseline.profile.taxClass = 1
    ws.baseline.assumptions.riester.forEach(r => {
      r.ownedBy = 'self'; r.monthlyOwnContribution = 75; r.eligibility.claimsChildAllowance = true
    })
    const f = buildPortfolioFunding(ws, rules)
    const schedules = Object.values(f.riesterYearlyByInstanceId)
    for (let y = 0; y < 30; y++) {
      expect(schedules[0][y].guenstigerpruefungBenefitAnnual).toBe(schedules[1][y].guenstigerpruefungBenefitAnnual)
      expect(schedules.reduce((sum, s) => sum + s[y].monthlyNetCost * 12 + s[y].guenstigerpruefungBenefitAnnual, 0)).toBeCloseTo(1800, 8)
    }
    const reversed = structuredClone(ws)
    reversed.baseline.assumptions.riester.reverse()
    expect(buildPortfolioFunding(reversed, rules).riesterByInstanceId).toEqual(f.riesterByInstanceId)
  })
  it('ineligible payments cannot inflate a small eligible payment or consume its headroom', () => {
    const ws = spouseFixture()
    ws.baseline.partner = undefined; ws.baseline.profile.taxClass = 1
    const [eligible, excluded] = ws.baseline.assumptions.riester
    eligible.monthlyOwnContribution = 5
    excluded.ownedBy = 'self'; excluded.monthlyOwnContribution = 150; excluded.fundingEligible = false
    const f = buildPortfolioFunding(ws, rules)
    expect(f.riesterByInstanceId[eligible.instanceId].guenstigerpruefungBenefitAnnual).toBeCloseTo(15.246575342465754, 8)
    expect(f.riesterByInstanceId[excluded.instanceId].monthlyNetCost).toBe(150)
    expect(f.headroom.riester.remainingAnnual).toBeCloseTo(1865, 6)
  })
  it('a saturated partner cap does not consume the first owner’s remaining headroom', () => {
    const ws = spouseFixture()
    ws.baseline.assumptions.riester[0].monthlyOwnContribution = 50
    ws.baseline.assumptions.riester[1].monthlyOwnContribution = 500
    const f = buildPortfolioFunding(ws, rules)
    expect(f.headroom.riester.remainingAnnual).toBeCloseTo(1325, 6)
    const before = f.riesterByInstanceId['riester-partner'].specialExpenseDeductibleAnnual
    ws.baseline.assumptions.riester[0].monthlyOwnContribution += f.headroom.riester.remainingAnnual / 12
    const after = buildPortfolioFunding(ws, rules)
    expect(after.riesterByInstanceId['riester-partner'].specialExpenseDeductibleAnnual).toBe(before)
    expect(after.riesterByInstanceId['riester-self'].specialExpenseDeductibleAnnual).toBeCloseTo(2100, 6)
  })
  it('validates missing partner facts, inconsistent person facts and duplicate child claims', () => {
    const ws = spouseFixture(50000, 30000, false, 1)
    expect(riesterHouseholdInputIssues(ws.baseline)).toEqual([])
    ws.baseline.assumptions.riester[0].eligibility.claimsChildAllowance = true
    expect(riesterHouseholdInputIssues(ws.baseline)).toHaveLength(1)
    ws.baseline.partner = undefined
    expect(riesterHouseholdInputIssues(ws.baseline)).toHaveLength(2)
    ws.baseline.assumptions.riester[1].ownedBy = 'self'
    ws.baseline.assumptions.riester[1].eligibility.directlyEligible = false
    expect(riesterHouseholdInputIssues(ws.baseline)).toHaveLength(1)
  })
  describe('R2-2 decision: direct owner allowance destination', () => {
    const directOnly = (contracts: Array<[string, number, boolean?]>) => {
      const ws = spouseFixture(50000, 30000, false, 1)
      ws.baseline.partner = undefined; ws.baseline.profile.taxClass = 1
      const direct = ws.baseline.assumptions.riester[0]
      ws.baseline.assumptions.riester = contracts.map(([instanceId, monthly, child]) => ({
        ...structuredClone(direct), instanceId, monthlyOwnContribution: monthly,
        eligibility: { ...direct.eligibility, claimsChildAllowance: child ?? false },
      }))
      return ws
    }
    const recipients = (ws: ReturnType<typeof directOnly>) => Object.entries(buildPortfolioFunding(ws, rules).riesterByInstanceId)
      .filter(([, f]) => f.receivesPortfolioAllowance).map(([id]) => id)

    it('prefers the paying contract over a EUR 0 contract that sorts first by id', () => {
      const ws = directOnly([['a-empty', 0], ['z-paid', 175]])
      const f = buildPortfolioFunding(ws, rules).riesterByInstanceId
      expect(f['z-paid'].totalAllowanceAnnual).toBe(175)
      expect(f['z-paid'].receivesPortfolioAllowance).toBe(true)
      expect(f['a-empty'].totalAllowanceAnnual).toBe(0)
      expect(f['a-empty'].receivesPortfolioAllowance).toBe(false)
      const reversed = structuredClone(ws)
      reversed.baseline.assumptions.riester.reverse()
      expect(buildPortfolioFunding(reversed, rules).riesterByInstanceId).toEqual(f)
    })
    it('a paying contract beats a EUR 0 contract with the larger full allowance', () => {
      expect(recipients(directOnly([['a-empty', 0, true], ['z-paid', 175]]))).toEqual(['z-paid'])
    })
    it('keeps the full-allowance then instanceId tie-break when all contracts pay or none pay', () => {
      expect(recipients(directOnly([['a-empty', 0], ['z-empty', 0]]))).toEqual(['a-empty'])
      // The amount paid is not a key: the smaller payment keeps the id tie-break.
      expect(recipients(directOnly([['a-small', 10], ['z-big', 175]]))).toEqual(['a-small'])
      expect(recipients(directOnly([['a-small', 10], ['z-big', 175, true]]))).toEqual(['z-big'])
      expect(recipients(directOnly([['a-empty', 0], ['m-child', 0, true], ['z-paid', 0]]))).toEqual(['m-child'])
    })
    it('household helper applies the same key outside the portfolio path', () => {
      const ws = directOnly([['a-empty', 0], ['z-paid', 175]])
      const salary = calculateSalaryResult(ws.baseline.profile, rules)
      const f = calculateRiesterHouseholdFunding(ws.baseline.assumptions.riester.map(c => ({
        instanceId: c.instanceId, ownedBy: c.ownedBy, contract: c,
      })), { self: { profile: ws.baseline.profile, salary } }, rules)
      expect(f['z-paid'].receivesPortfolioAllowance).toBe(true)
      expect(f['a-empty'].receivesPortfolioAllowance).toBe(false)
    })
    it('top-up candidate on the EUR 0 contract matches the applied portfolio', () => {
      // z-paid meets the 4 % minimum (2000 - 175), leaving 100 EUR/year cap headroom.
      const ws = directOnly([['a-empty', 0], ['z-paid', 1825 / 12]])
      const before = buildPortfolioFunding(ws, rules)
      expect(before.riesterByInstanceId['z-paid'].receivesPortfolioAllowance).toBe(true)
      const candidate = makeRiesterTopUpCandidate(buildGeneratorContext(ws, 50))
      expect(candidate).not.toBeNull()
      expect(candidate!.targetInstanceId).toBe('a-empty')
      ws.baseline.assumptions.riester[0].monthlyOwnContribution += candidate!.grossMonthlyEUR
      const after = buildPortfolioFunding(ws, rules)
      const cost = (f: typeof before) => Object.values(f.riesterByInstanceId).reduce((s, r) => s + r.monthlyNetCost, 0)
      expect(cost(after) - cost(before)).toBeCloseTo(candidate!.netCashOutEUR, 8)
      // Once both pay, the existing tie-break returns the allowance to a-empty.
      expect(after.riesterByInstanceId['a-empty'].receivesPortfolioAllowance).toBe(true)
      const allowance = (f: typeof before) => Object.values(f.riesterByInstanceId).reduce((s, r) => s + r.totalAllowanceAnnual, 0)
      expect(allowance(after)).toBe(allowance(before))
    })
  })
})
