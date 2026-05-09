/**
 * Single-anchor monthly-contribution sync. The user-facing input for every
 * "monthly investment" product (bAV, Basisrente, AVD, Riester) is the target
 * monthly net cost — the actual cash leaving the user's pocket each month after
 * every refund/subsidy. From that one anchor we back-solve each product's
 * internal gross/Eigenbeitrag so all six products invest the same true netto.
 *
 *   - bAV:        inverse = solveBavGrossFromNet (bisection over tax/SV/employer subsidy).
 *   - Basisrente: inverse = solveBasisrenteGrossFromNet (bisection; uses the
 *                 salary-after-bAV-conversion taxable income for the marginal tax saving).
 *   - AVD:        inverse = solveAvdOwnFromNet (bisection; clamps at AltZertG cap).
 *   - Riester:    inverse = solveRiesterOwnFromNet (bisection over §10a Günstigerprüfung).
 *
 * (ETF and pAV have no editable monthly field — they always invest the synced net.)
 *
 * Canonical location: src/utils/syncContributions.ts
 * (Moved from src/app/syncContributions.ts — engine/api must not import from src/app.)
 */

import type { GermanRules, PersonalProfile, ScenarioAssumptions } from '../domain'
import { calculateBavFunding, solveBavGrossFromNet } from '../engine/salary'
import { solveBasisrenteGrossFromNet } from '../engine/basisrente'
import {
  maxAvdMonthlyOwnContribution,
  solveAvdOwnFromNet,
} from '../engine/altersvorsorgedepot'
import { solveRiesterOwnFromNet } from '../engine/riester'

export function normalizeMonthlyNettoBelastung(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0)
}

export function syncMonthlyContributions(
  targetNet: number,
  current: ScenarioAssumptions,
  profile: PersonalProfile,
  rules: GermanRules,
): ScenarioAssumptions {
  const anchor = normalizeMonthlyNettoBelastung(targetNet)

  const bavGross = solveBavGrossFromNet(anchor, profile, rules, current.bav)
  const bavFunding = calculateBavFunding(profile, rules, {
    ...current.bav,
    monthlyGrossConversion: bavGross,
  })

  const basisrenteGross = solveBasisrenteGrossFromNet(
    anchor,
    rules,
    bavFunding.salaryWithBav,
    current.basisrente,
  )

  const avdMaxMonthly = maxAvdMonthlyOwnContribution(
    current.altersvorsorgedepot.eligibility,
    rules,
    !current.altersvorsorgedepot.eligibility.careerStarterBonusUsed,
  )
  const avdOwn = Math.min(
    solveAvdOwnFromNet(anchor, rules, bavFunding.salaryWithBav, current.altersvorsorgedepot),
    avdMaxMonthly,
  )

  const riesterOwn = solveRiesterOwnFromNet(
    anchor,
    rules,
    bavFunding.salaryWithBav,
    current.riester,
    profile,
  )

  return {
    ...current,
    compareSubMode: undefined,
    equalInputAmountEUR: anchor,
    bav: { ...current.bav, monthlyGrossConversion: bavGross },
    basisrente: { ...current.basisrente, monthlyGrossContribution: basisrenteGross },
    altersvorsorgedepot: {
      ...current.altersvorsorgedepot,
      monthlyOwnContribution: avdOwn,
    },
    riester: { ...current.riester, monthlyOwnContribution: riesterOwn },
  }
}
