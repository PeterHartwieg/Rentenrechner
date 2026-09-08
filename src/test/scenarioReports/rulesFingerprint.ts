/**
 * Evaluated cohort-schedule fingerprint for the scenario-report suite (issue #377).
 *
 * The year rules AND every exported cross-year constant are already covered by
 * `ruleSetIdentity` / `canonicalRuleSetSnapshot` (src/rules/ruleMetadata.ts)
 * over the `legalRuleData` catalog — the suite does NOT keep its own inventory
 * of those data. What no JSON snapshot can see is CODE: the parametrised cohort
 * functions of `legalConstants.ts` (§22 Besteuerungsanteil, §19 Abs. 2
 * Versorgungsfreibetrag, §22 Nr. 1 Ertragsanteil, §20 Abs. 1 Nr. 6 Halbeinkünfte
 * minimum age) drop out of any serialization, so an amendment to those formulas
 * would go unnoticed while stage deltas get misattributed to "model changes".
 *
 * The fingerprint therefore evaluates each cohort schedule over its full legal
 * span and freezes the outputs. It is used ONLY as an identity/drift signal
 * (like the engine-source digest), never as an expected value — the
 * independent anchors for these very values remain the external golden tests.
 */

import {
  besteuerungsanteilGrv,
  ertragsanteilByAge,
  halbeinkuenfteMinAgeForContractStartYear,
  versorgungsfreibetrag,
} from '../../rules/legalConstants'

const FIRST_RETIREMENT_YEAR = 2005
const LAST_RETIREMENT_YEAR = 2060
const FIRST_CONTRACT_START_YEAR = 1990
const LAST_CONTRACT_START_YEAR = 2030
const MIN_ERTRAGSANTEIL_AGE = 55
const MAX_ERTRAGSANTEIL_AGE = 75

export interface CohortScheduleFingerprint {
  /** §22 Nr. 1 Satz 3 a aa EStG — taxable fraction per retirement cohort year. */
  besteuerungsanteilGrvByRetirementYear: Record<string, number>
  /** §19 Abs. 2 EStG — Freibetrag row (prozent / hoechstbetrag / zuschlag) per retirement year. */
  versorgungsfreibetragByRetirementYear: Record<
    string,
    { prozent: number; hoechstbetrag: number; zuschlag: number }
  >
  /** §22 Nr. 1 Ertragsanteil table by payout start age. */
  ertragsanteilByPayoutAge: Record<string, number>
  /** §20 Abs. 1 Nr. 6 / §52 Abs. 28 minimum payout age per contract-start year. */
  halbeinkuenfteMinAgeByContractStartYear: Record<string, number>
}

/** Evaluated cohort schedules — the code-shaped part of the rules identity. */
export function cohortScheduleFingerprint(): CohortScheduleFingerprint {
  const besteuerungsanteil: Record<string, number> = {}
  const freibetrag: CohortScheduleFingerprint['versorgungsfreibetragByRetirementYear'] = {}
  for (let year = FIRST_RETIREMENT_YEAR; year <= LAST_RETIREMENT_YEAR; year++) {
    besteuerungsanteil[String(year)] = besteuerungsanteilGrv(year)
    freibetrag[String(year)] = versorgungsfreibetrag(year)
  }

  const ertragsanteil: Record<string, number> = {}
  for (let age = MIN_ERTRAGSANTEIL_AGE; age <= MAX_ERTRAGSANTEIL_AGE; age++) {
    ertragsanteil[String(age)] = ertragsanteilByAge(age)
  }

  const halbeinkuenfteMinAge: Record<string, number> = {}
  for (let year = FIRST_CONTRACT_START_YEAR; year <= LAST_CONTRACT_START_YEAR; year++) {
    halbeinkuenfteMinAge[String(year)] = halbeinkuenfteMinAgeForContractStartYear(year)
  }

  return {
    besteuerungsanteilGrvByRetirementYear: besteuerungsanteil,
    versorgungsfreibetragByRetirementYear: freibetrag,
    ertragsanteilByPayoutAge: ertragsanteil,
    halbeinkuenfteMinAgeByContractStartYear: halbeinkuenfteMinAge,
  }
}
