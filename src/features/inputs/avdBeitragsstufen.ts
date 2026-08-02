/**
 * AVD Beitragsstufen — rule-derived quick-choice contribution levels.
 *
 * The Finanzfluss AVD audit (`docs/finanzfluss-avd-frontend-audit.md`) asks for
 * meaningful quick choices instead of expecting users to know the statutory
 * thresholds. Every value here is **derived from `rules.altersvorsorgedepot`**,
 * never written as a literal: a monthly figure like "150 EUR" is just
 * `basicAllowanceTier2MaxContribution / 12`, and a statutory literal inside
 * `src/features/` is a P0 under the review guidelines in CLAUDE.md. Deriving
 * them means a future `de2027.ts` carries through for free.
 *
 * React-free on purpose so it can be unit-tested without a DOM, mirroring
 * `engine/productRegistry.ts` and `inventory/inventoryProductRegistry.ts`.
 */

import type { AltersvorsorgedepotAssumptions, GermanRules } from '../../domain'
import { maxAvdMonthlyOwnContribution } from '../../engine/altersvorsorgedepot'
import { formatPercent } from '../../utils/format'

export interface AvdBeitragsstufe {
  /** Monthly Eigenbeitrag in EUR. */
  value: number
  /** Short card headline. */
  label: string
  /** One-line explanation of what the statutory threshold actually is. */
  hint: string
}

type Eligibility = AltersvorsorgedepotAssumptions['eligibility']

/**
 * Build the Beitragsstufen for the given rules and eligibility.
 *
 * Pass the **effective** eligibility — the same one the funding calculation
 * uses. `calculateAvdFunding` overrides `eligibleChildren` from
 * `profile.childBirthYears` when a profile is supplied, so handing this
 * function a different child count makes the Vertragsrahmen card contradict the
 * `cappedAtContractMax` warning rendered next to it.
 *
 * `AltersvorsorgedepotEligibility` does not expose an explicit first-
 * contribution-year flag, so the contract ceiling approximates it with
 * `!eligibility.careerStarterBonusUsed`. Add such a flag to eligibility if the
 * UI later supports distinguishing an unused bonus from the first year.
 *
 * Levels, in ascending order:
 *   - Mindestbeitrag           — the annual eligibility floor; below it every
 *                                allowance is zero.
 *   - Ende der N-%-Stufe       — direct savers only; the last euro still
 *                                matched at the tier-1 rate.
 *   - Volle Grundzulage        — direct savers only; where their basic
 *                                allowance reaches its maximum.
 *   - Volle mittelbare Zulage  — indirect-only savers; where their applicable
 *                                capped allowance reaches its maximum.
 *   - Vertragsrahmen           — the largest Eigenbeitrag the AltZertG contract
 *                                ceiling still admits, allowances included.
 *
 * Levels at or above the Vertragsrahmen are dropped and duplicates collapsed,
 * so a saver with many children (whose ceiling falls below the full-allowance
 * level) gets a shorter, still-correct list rather than contradictory cards.
 */
export function buildAvdBeitragsstufen(
  rules: GermanRules,
  eligibility: Eligibility,
): AvdBeitragsstufe[] {
  const avd = rules.altersvorsorgedepot
  const vertragsrahmen = maxAvdMonthlyOwnContribution(
    eligibility,
    rules,
    !eligibility.careerStarterBonusUsed,
  )

  const candidates: AvdBeitragsstufe[] = []

  if (eligibility.directlyEligible || eligibility.indirectSpouseEligible) {
    candidates.push({
      value: avd.minimumOwnContributionAnnual / 12,
      label: 'Mindestbeitrag',
      hint: `Erreicht die Förderschwelle von ${avd.minimumOwnContributionAnnual} € im Jahr — darunter gibt es keine Zulage.`,
    })
  }

  if (eligibility.directlyEligible) {
    candidates.push(
      {
        value: avd.basicAllowanceTier1MaxContribution / 12,
        // The percentage is a statutory value too, so it is derived rather than
        // written out. Note this is the *end* of the tier, not the point of
        // highest Förderquote — the quota is identical at every lower level.
        label: `Ende der ${formatPercent(avd.basicAllowanceTier1Rate, 0)}-Stufe`,
        hint: `Bis ${avd.basicAllowanceTier1MaxContribution} € im Jahr legt der Staat ${formatPercent(avd.basicAllowanceTier1Rate, 0)} drauf, darüber weniger.`,
      },
      {
        value: avd.basicAllowanceTier2MaxContribution / 12,
        label: 'Volle Grundzulage',
        hint: `Schöpft die Grundzulage von ${avd.basicAllowanceMax} € im Jahr vollständig aus.`,
      },
    )
  } else if (eligibility.indirectSpouseEligible) {
    const indirectAllowanceMax = Math.min(
      avd.indirectSpouseBasicAllowanceMax,
      avd.basicAllowanceMax,
    )
    const tier1AllowanceMax =
      avd.basicAllowanceTier1MaxContribution * avd.basicAllowanceTier1Rate
    const annualContributionForIndirectMax = indirectAllowanceMax <= tier1AllowanceMax
      ? indirectAllowanceMax / avd.basicAllowanceTier1Rate
      : avd.basicAllowanceTier1MaxContribution
        + (indirectAllowanceMax - tier1AllowanceMax) / avd.basicAllowanceTier2Rate

    candidates.push({
      value: Math.max(
        avd.minimumOwnContributionAnnual,
        Math.min(annualContributionForIndirectMax, avd.basicAllowanceTier2MaxContribution),
      ) / 12,
      label: 'Volle mittelbare Zulage',
      hint: `Schöpft die mittelbare Zulage von ${indirectAllowanceMax} € im Jahr vollständig aus.`,
    })
  }

  candidates.push({
    value: vertragsrahmen,
    label: 'Vertragsrahmen',
    hint: `Nutzt die Vertragsobergrenze von ${avd.contractContributionCapAnnual} € im Jahr aus (Eigenbeitrag plus Zulagen).`,
  })

  const out: AvdBeitragsstufe[] = []
  for (const stufe of candidates) {
    if (!(stufe.value > 0)) continue
    // Anything at or beyond the ceiling is either unreachable or the ceiling
    // itself; the Vertragsrahmen entry represents that endpoint.
    if (stufe.value > vertragsrahmen) continue
    const collision = out.findIndex((existing) => Math.abs(existing.value - stufe.value) < 0.005)
    if (collision >= 0) {
      // The later ceiling candidate must keep its user-facing endpoint label;
      // other near-equal candidates retain the existing first-entry behavior.
      if (stufe.label === 'Vertragsrahmen') out[collision] = stufe
      continue
    }
    out.push(stufe)
  }
  return out
}
