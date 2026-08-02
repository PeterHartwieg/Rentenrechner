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
 * ## AVD-Eigenbeitrag mode
 *
 * `ScenarioAssumptions.contributionInput` may flip the direction for the
 * Altersvorsorgedepot: the statutory AVD thresholds (120 EUR/yr Mindestbeitrag,
 * the 50 %/25 % Zulagenstufen, the AltZertG Vertragsrahmen) all apply to the
 * *Eigenbeitrag*, not to the net cost, so the UI lets the user steer that
 * instead. In `{ kind: 'avd-own' }` mode the Eigenbeitrag is held fixed and the
 * comparison anchor is **derived from it here, on every call** — never computed
 * once at the write site and stored.
 *
 * Deriving on every call is the whole point. `equalInputAmountEUR` becomes an
 * output in this mode; frozen at write time it would go stale the moment
 * anything feeding the tax basis changed. Concretely: pin 150 EUR/month, then
 * raise the salary by 20 000 EUR — AVD's true net cost falls to 113.08 EUR while
 * a stored anchor would still read 122.75 EUR, so every other product would
 * invest 9.67 EUR/month more than AVD actually costs, permanently and across
 * reloads. Deriving here keeps all five call sites (useSimulationResult,
 * useAngabenState, buildAllProductsSimulation, api/comparison, harmonizeOnLoad)
 * consistent without touching any of them.
 */

import type { GermanRules, PersonalProfile, ScenarioAssumptions } from '../domain'
import { calculateBavFunding, solveBavGrossFromNet } from '../engine/salary'
import { solveBasisrenteGrossFromNet } from '../engine/basisrente'
import {
  calculateAvdFunding,
  maxAvdMonthlyOwnContribution,
  solveAvdOwnFromNet,
} from '../engine/altersvorsorgedepot'
import { solveRiesterOwnFromNet } from '../engine/riester'

export function normalizeMonthlyNettoBelastung(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0)
}

/** Convergence tolerance for the pinned-Eigenbeitrag anchor fixed point (EUR/month). */
const ANCHOR_TOLERANCE_EUR = 1e-6

/** Hard iteration cap for the anchor fixed point. Measured worst case: 3. */
const ANCHOR_MAX_ITERATIONS = 20

/**
 * Largest Eigenbeitrag the AltZertG contract ceiling still admits under the
 * given eligibility. Exported so the UI can bound its input with exactly the
 * value the sync will clamp to.
 */
export function avdMaxMonthlyOwn(
  current: ScenarioAssumptions,
  rules: GermanRules,
): number {
  return maxAvdMonthlyOwnContribution(
    current.altersvorsorgedepot.eligibility,
    rules,
    !current.altersvorsorgedepot.eligibility.careerStarterBonusUsed,
  )
}

/**
 * Derive the comparison anchor for a pinned AVD Eigenbeitrag.
 *
 * The anchor is AVD's true monthly net cost, but that cost depends on the salary
 * basis, which depends on the bAV conversion, which is itself solved from the
 * anchor. The anchor is therefore a fixed point of
 *
 *     a = netCost(salaryAfterBavConversion(a), own)
 *
 * solved by plain iteration. This runs *forward* through `calculateAvdFunding`
 * and never inverts it, so neither the discontinuity at the 120 EUR/yr
 * eligibility threshold nor the plateau at the AltZertG ceiling can produce an
 * unreachable target — which is exactly what sank the alternative design of
 * bisecting the inverse.
 *
 * ## Why cycle detection rather than a loose tolerance
 *
 * `floorEuro(zvE)` quantises the annual tax saving into whole euros, so the
 * iterated map is a step function. When the fixed point falls on a riser rather
 * than a tread, plain iteration 2-cycles forever between adjacent treads.
 * Measured over own = 0…525 EUR in 2.50 EUR steps at the default salary: 30 of
 * 211 points (14.2 %) cycle, with amplitude 1/12 EUR — one euro of annual tax
 * saving spread over twelve months. Widening the tolerance cannot fix this
 * cleanly: it would have to exceed the amplitude, and 0.05 EUR was measured to
 * still fail on all 30 points.
 *
 * The amplitude is **not** always 1/12. At the pension BBG (101 400 EUR salary)
 * the bAV conversion crosses an SV threshold and the step grows: measured
 * 0.0933 EUR/month at own = 150 and own = 195. A salary sweep to 260 000 EUR
 * and an own sweep to 525 EUR put the worst observed amplitude at 0.0933 EUR.
 * Do not re-derive this bound from theory — measure it if the tax code changes.
 *
 * On a detected cycle we return the **larger** member. Both lie within one
 * amplitude of the true cost; the larger one has the other products investing
 * marginally more than AVD costs rather than less, so the residual works against
 * AVD in the comparison instead of flattering it.
 */
function anchorForPinnedAvdOwn(
  monthlyOwn: number,
  current: ScenarioAssumptions,
  profile: PersonalProfile,
  rules: GermanRules,
): number {
  if (!(monthlyOwn > 0)) return 0

  const netCostAt = (anchor: number): number => {
    const bavGross = solveBavGrossFromNet(anchor, profile, rules, current.bav)
    const bavFunding = calculateBavFunding(profile, rules, {
      ...current.bav,
      monthlyGrossConversion: bavGross,
    })
    return calculateAvdFunding(rules, bavFunding.salaryWithBav, {
      ...current.altersvorsorgedepot,
      monthlyOwnContribution: monthlyOwn,
    }).monthlyNetCost
  }

  let anchor = netCostAt(0)
  const seen: number[] = [anchor]
  for (let i = 0; i < ANCHOR_MAX_ITERATIONS; i++) {
    const next = netCostAt(anchor)
    if (Math.abs(next - anchor) < ANCHOR_TOLERANCE_EUR) return next
    // Revisiting an earlier iterate means we are in a cycle and will never meet
    // the tolerance; take the conservative (larger) member and stop.
    if (seen.some((v) => Math.abs(v - next) < 1e-9)) return Math.max(next, anchor)
    seen.push(next)
    anchor = next
  }
  return anchor
}

export function syncMonthlyContributions(
  targetNet: number,
  current: ScenarioAssumptions,
  profile: PersonalProfile,
  rules: GermanRules,
): ScenarioAssumptions {
  const avdMaxMonthly = avdMaxMonthlyOwn(current, rules)

  // A pinned AVD Eigenbeitrag only steers the comparison while AVD is part of
  // it. `simulateRetirementComparison` builds the funding context even for
  // hidden products, so without this guard an invisible AVD would keep sizing
  // every visible one. The pin is *ignored*, not erased — re-adding AVD to the
  // comparison restores the user's choice rather than silently discarding it.
  const pin =
    current.contributionInput?.kind === 'avd-own' &&
    current.visibleProducts.includes('altersvorsorgedepot')
      ? current.contributionInput
      : null

  // Re-clamp on every call: the ceiling moves when eligibility changes (adding
  // two children drops it from 525 to 475 EUR/month), and the pinned branch
  // skips the back-solve path where that clamp normally lives.
  const pinnedOwn =
    pin === null ? null : Math.min(normalizeMonthlyNettoBelastung(pin.monthlyOwn), avdMaxMonthly)

  const anchor =
    pinnedOwn === null
      ? normalizeMonthlyNettoBelastung(targetNet)
      : anchorForPinnedAvdOwn(pinnedOwn, current, profile, rules)

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

  // In pinned mode the Eigenbeitrag is the user's input — take it as given
  // rather than round-tripping it through the inverse, which would not return
  // the same number (the inverse runs on the anchor-shifted salary basis).
  const avdOwn =
    pinnedOwn === null
      ? Math.min(
          solveAvdOwnFromNet(anchor, rules, bavFunding.salaryWithBav, current.altersvorsorgedepot),
          avdMaxMonthly,
        )
      : pinnedOwn

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
    // Write the clamped Eigenbeitrag back so stored state and simulation agree.
    // States with no pin keep the field absent — output stays byte-identical to
    // the pre-feature behaviour.
    ...(pinnedOwn === null
      ? {}
      : { contributionInput: { kind: 'avd-own' as const, monthlyOwn: pinnedOwn } }),
    bav: { ...current.bav, monthlyGrossConversion: bavGross },
    basisrente: { ...current.basisrente, monthlyGrossContribution: basisrenteGross },
    altersvorsorgedepot: {
      ...current.altersvorsorgedepot,
      monthlyOwnContribution: avdOwn,
    },
    riester: { ...current.riester, monthlyOwnContribution: riesterOwn },
  }
}
