/**
 * Bidirectional monthly-contribution sync across the four products that have a
 * "monthly investment" input: bAV, Basisrente, Altersvorsorgedepot, Riester.
 * (ETF and pAV have no editable monthly field — they always invest the synced net.)
 *
 * Common axis: monthly net cost out-of-pocket. Editing any of the four fields
 * derives that anchor and back-solves the other three:
 *   - bAV:        forward = calculateBavFunding (gross → net via tax/SV/employer subsidy);
 *                 inverse = solveBavGrossFromNet (bisection).
 *   - Basisrente: forward = calculateBasisrenteFunding (gross → net via §10 Abs. 3
 *                 marginal tax saving); inverse = solveBasisrenteGrossFromNet (bisection).
 *                 Note: depends on salary-after-bAV-conversion, so coupled with bAV.
 *   - AVD:        Eigenbeitrag = net (no transformation).
 *   - Riester:    Eigenbeitrag = net (no transformation).
 *
 * The bAV↔Basisrente coupling (Basisrente's net depends on the salary tax bracket
 * which depends on bAV's gross conversion) is settled with two passes — the
 * salary marginal rate barely moves over typical contribution adjustments, so
 * convergence is well under one cent in practice.
 */

import type { GermanRules, PersonalProfile, ScenarioAssumptions } from '../domain'
import { calculateBavFunding, solveBavGrossFromNet } from '../engine/salary'
import {
  calculateBasisrenteFunding,
  solveBasisrenteGrossFromNet,
} from '../engine/basisrente'
import { maxAvdMonthlyOwnContribution } from '../engine/altersvorsorgedepot'

export type ContributionSource = 'bav' | 'basisrente' | 'avd' | 'riester'

export function syncMonthlyContributions(
  source: ContributionSource,
  value: number,
  current: ScenarioAssumptions,
  profile: PersonalProfile,
  rules: GermanRules,
): ScenarioAssumptions {
  const rawSanitized = Math.max(0, Number.isFinite(value) ? value : 0)

  // AltZertG contract cap (§1, Altersvorsorgereformgesetz): own + allowances ≤
  // 6 840 EUR/year. When the user types directly in AVD above the cap, the
  // anchor itself is clamped — all four fields rebalance to the cap, since AVD
  // physically can't accept more. When the user types in another field, that
  // field's value (= the anchor) stays as typed; only AVD's display is clamped
  // (other products can invest beyond AVD's cap), and the comparison view
  // surfaces a "Beitragsobergrenze erreicht" badge.
  const avdMaxMonthly = maxAvdMonthlyOwnContribution(
    current.altersvorsorgedepot.eligibility,
    rules,
    !current.altersvorsorgedepot.eligibility.careerStarterBonusUsed,
  )
  const sanitized = source === 'avd' ? Math.min(rawSanitized, avdMaxMonthly) : rawSanitized

  // bAV gross and Basisrente gross are the two coupled fields. AVD/Riester are
  // identity-mapped to the anchor.
  let bavGross = source === 'bav' ? sanitized : current.bav.monthlyGrossConversion
  let basisrenteGross =
    source === 'basisrente' ? sanitized : current.basisrente.monthlyGrossContribution

  // Two passes settle the bAV↔Basisrente coupling.
  let anchor = sanitized
  for (let pass = 0; pass < 2; pass++) {
    const bavFunding = calculateBavFunding(profile, rules, {
      ...current.bav,
      monthlyGrossConversion: bavGross,
    })

    if (source === 'avd' || source === 'riester') {
      anchor = sanitized
    } else if (source === 'bav') {
      anchor = bavFunding.monthlyNetCost
    } else {
      anchor = calculateBasisrenteFunding(rules, bavFunding.salaryWithBav, {
        ...current.basisrente,
        monthlyGrossContribution: basisrenteGross,
      }).monthlyNetCost
    }

    if (source !== 'bav') {
      bavGross = solveBavGrossFromNet(anchor, profile, rules, current.bav)
    }
    if (source !== 'basisrente') {
      const updatedBavFunding = calculateBavFunding(profile, rules, {
        ...current.bav,
        monthlyGrossConversion: bavGross,
      })
      basisrenteGross = solveBasisrenteGrossFromNet(
        anchor,
        rules,
        updatedBavFunding.salaryWithBav,
        current.basisrente,
      )
    }
  }

  const avdOwn = Math.min(anchor, avdMaxMonthly)

  return {
    ...current,
    bav: { ...current.bav, monthlyGrossConversion: bavGross },
    basisrente: { ...current.basisrente, monthlyGrossContribution: basisrenteGross },
    altersvorsorgedepot: {
      ...current.altersvorsorgedepot,
      monthlyOwnContribution: avdOwn,
    },
    riester: { ...current.riester, monthlyOwnContribution: anchor },
  }
}
