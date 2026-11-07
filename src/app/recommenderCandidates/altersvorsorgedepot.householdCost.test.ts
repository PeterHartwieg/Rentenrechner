/**
 * Issue #436 reproduction — AVD candidate cost vs applied household net-cost delta.
 *
 * Documents CURRENT behaviour only (investigation run; no engine or candidate
 * change). `makeAvdCandidate` reports `netCashOutEUR === grossMonthlyEUR`.
 * The household delta is measured the same way the #435 Riester budget-parity
 * test measures it: Σ `monthlyNetCost` over every funded contract after
 * appending the candidate's `newInstance`, minus the same sum on the
 * candidate's own baseline `portfolioFunding`.
 *
 * The figures pinned below are the observed values on main (2026-11-07).
 * The `it.fails` block records the desired parity and must start passing
 * (and be flipped to `it`) when #436 is fixed.
 */

import { describe, expect, it } from 'vitest'
import { de2026Rules } from '../../rules/de2026'
import { buildPortfolioFunding } from '../../engine/portfolioFunding'
import { maxAvdMonthlyOwnContribution } from '../../engine/altersvorsorgedepot'
import { defaultAssumptions } from '../../data/defaultScenario'
import { makeAvdCandidate } from './altersvorsorgedepot'
import { buildBerndWorkspace, buildGeneratorContext } from './testHelpers'
import type { AltersvorsorgedepotInstance } from '../../domain/instances'

type Ws = ReturnType<typeof buildBerndWorkspace>
type Funding = ReturnType<typeof buildPortfolioFunding>

const householdNetCost = (f: Funding) => [
  ...Object.values(f.bavByInstanceId),
  ...Object.values(f.basisrenteByInstanceId),
  ...Object.values(f.riesterByInstanceId),
  ...Object.values(f.altersvorsorgedepotByInstanceId),
].reduce((total, row) => total + row.monthlyNetCost, 0)

function applyAvdCandidate(ws: Ws, budget: number) {
  const g = buildGeneratorContext(ws, budget)
  const draft = makeAvdCandidate(g)!
  const created = draft.newInstance as AltersvorsorgedepotInstance
  const applied = structuredClone(ws)
  applied.baseline.assumptions.altersvorsorgedepot.push(created)
  const after = buildPortfolioFunding(applied, de2026Rules)
  return {
    draft,
    before: g.portfolioFunding,
    after,
    createdId: created.instanceId,
    householdDelta: householdNetCost(after) - householdNetCost(g.portfolioFunding),
  }
}

const capMonthly = maxAvdMonthlyOwnContribution(
  defaultAssumptions.altersvorsorgedepot.eligibility,
  de2026Rules,
)

function withSalary(grossSalaryYear: number): Ws {
  const ws = buildBerndWorkspace()
  ws.baseline.profile.grossSalaryYear = grossSalaryYear
  return ws
}

/** Age 23, existing active AVD that holds the career-starter bonus. */
function competingAvd(): Ws {
  const ws = buildBerndWorkspace()
  ws.baseline.profile.age = 23
  ws.baseline.assumptions.riester = []
  const existing = ws.baseline.assumptions.altersvorsorgedepot[0]
  existing.status = 'active'
  existing.monthlyOwnContribution = 100
  existing.eligibility = {
    ...existing.eligibility, directlyEligible: true, ageAtContractStart: 23, careerStarterBonusUsed: false,
  }
  return ws
}

/** Age 22, existing active self-owned Riester that holds the career-starter bonus. */
function competingRiester(monthlyOwnContribution = 100): Ws {
  const ws = buildBerndWorkspace()
  ws.baseline.profile.age = 22
  ws.baseline.assumptions.altersvorsorgedepot = []
  const riester = ws.baseline.assumptions.riester[0]
  riester.status = 'active'
  riester.ownedBy = 'self'
  riester.monthlyOwnContribution = monthlyOwnContribution
  riester.eligibility = {
    ...riester.eligibility, directlyEligible: true, indirectSpouseEligible: false,
    careerStarterBonusUsed: false, ageAtContractStart: 20,
  }
  return ws
}

/** Joint household: partner (age 22) owns a bonus-eligible Riester that claims the child. */
function partnerRiester(): Ws {
  const ws = buildBerndWorkspace()
  ws.baseline.profile.childBirthYears = [2018]
  ws.baseline.profile.grossSalaryYear = 70_000
  ws.baseline.partner = { ...ws.baseline.profile, age: 22, grossSalaryYear: 30_000, taxClass: 1 }
  ws.baseline.assumptions.altersvorsorgedepot = []
  const riester = ws.baseline.assumptions.riester[0]
  riester.status = 'active'
  riester.ownedBy = 'partner'
  riester.monthlyOwnContribution = 50
  riester.eligibility = {
    ...riester.eligibility, directlyEligible: true, indirectSpouseEligible: false,
    careerStarterBonusUsed: false, ageAtContractStart: 22, claimsChildAllowance: true,
  }
  return ws
}

// [name, workspace, budget, observed gross, observed household delta]
const DIVERGENT: Array<[string, () => Ws, number, number, number]> = [
  ['Bernd default, €200', buildBerndWorkspace, 200, 200, 173.416667],
  ['Bernd default, near AVD contract cap', buildBerndWorkspace, capMonthly + 200, 525, 498.416667],
  ['salary €60k, €150', () => withSalary(60_000), 150, 150, 131.833333],
  ['salary €90k, €150', () => withSalary(90_000), 150, 150, 114.333333],
  ['salary €150k, near AVD contract cap', () => withSalary(150_000), capMonthly + 200, 525, 483.577917],
  ['competing AVD bonus recipient, €50', competingAvd, 50, 50, 39.416667],
  ['competing Riester bonus recipient, €100', () => competingRiester(100), 100, 100, 86.268445],
  ['competing €10/mo Riester bonus recipient, €100', () => competingRiester(10), 100, 100, 93.485178],
  ['partner household with partner Riester, €150', partnerRiester, 150, 150, 135.5],
]

describe('#436 reproduction — AVD candidate cost vs household net-cost delta (current behaviour)', () => {
  it.each(DIVERGENT)('%s: netCashOutEUR = gross, household delta is lower', (_name, build, budget, gross, delta) => {
    const r = applyAvdCandidate(build(), budget)
    expect(r.draft.grossMonthlyEUR).toBeCloseTo(gross, 6)
    expect(r.draft.netCashOutEUR).toBe(r.draft.grossMonthlyEUR)
    expect(r.householdDelta).toBeCloseTo(delta, 5)
    expect(r.draft.netCashOutEUR - r.householdDelta).toBeGreaterThan(0.5)
  })

  it('no divergence at low income without bonus competition (salary €20k)', () => {
    for (const budget of [150, capMonthly + 200]) {
      const r = applyAvdCandidate(withSalary(20_000), budget)
      expect(r.after.altersvorsorgedepotByInstanceId[r.createdId].guenstigerpruefungBenefitAnnual).toBe(0)
      expect(r.householdDelta).toBeCloseTo(r.draft.netCashOutEUR, 8)
    }
  })

  it('no divergence with unclaimed children at low income (salary €25k, no other contracts)', () => {
    const ws = withSalary(25_000)
    ws.baseline.profile.childBirthYears = [2018, 2020]
    ws.baseline.assumptions.riester = []
    ws.baseline.assumptions.altersvorsorgedepot = []
    const r = applyAvdCandidate(ws, 100)
    expect(r.draft.netCashOutEUR).toBe(100)
    expect(r.householdDelta).toBeCloseTo(100, 8)
  })

  it('competing AVD: the candidate takes the existing contract career-starter bonus', () => {
    const r = applyAvdCandidate(competingAvd(), 50)
    const existingId = 'altersvorsorgedepot-singleton'
    expect(r.before.altersvorsorgedepotByInstanceId[existingId].careerStarterBonusAnnual).toBe(200)
    expect(r.after.altersvorsorgedepotByInstanceId[existingId].careerStarterBonusAnnual).toBe(0)
    expect(r.after.altersvorsorgedepotByInstanceId[r.createdId].careerStarterBonusAnnual).toBe(200)
    // The new contract alone costs its gross; the shortfall comes from the
    // existing contract's lower monthlyNetCost after the bonus moves.
    expect(r.after.altersvorsorgedepotByInstanceId[r.createdId].monthlyNetCost).toBeCloseTo(50, 8)
    expect(r.after.altersvorsorgedepotByInstanceId[existingId].monthlyNetCost)
      .toBeLessThan(r.before.altersvorsorgedepotByInstanceId[existingId].monthlyNetCost)
  })

  it('competing Riester: the candidate takes the Riester career-starter bonus', () => {
    const r = applyAvdCandidate(competingRiester(), 100)
    const riesterId = 'riester-singleton'
    expect(r.before.riesterByInstanceId[riesterId].careerStarterBonusAnnual).toBeGreaterThan(0)
    expect(r.after.riesterByInstanceId[riesterId].careerStarterBonusAnnual).toBe(0)
    expect(r.after.altersvorsorgedepotByInstanceId[r.createdId].careerStarterBonusAnnual).toBe(200)
  })
})

describe('#436 desired behaviour (expected to fail until #436 is fixed)', () => {
  it.fails.each(DIVERGENT)('%s: netCashOutEUR equals the applied household net-cost delta', (_name, build, budget) => {
    const r = applyAvdCandidate(build(), budget)
    expect(r.draft.netCashOutEUR).toBeCloseTo(r.householdDelta, 6)
  })
})
