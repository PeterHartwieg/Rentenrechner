/**
 * Rules fingerprint for the scenario-report suite (issue #377).
 *
 * `legalConstants` mixes plain constants with PARAMETRISED cohort functions
 * (§22 Besteuerungsanteil, §19 Abs. 2 Versorgungsfreibetrag, §22 Nr. 1
 * Ertragsanteil, §20 Abs. 1 Nr. 6 Halbeinkünfte minimum age). `JSON.stringify`
 * drops the functions — a rules snapshot of the data alone would not pin the
 * cohort implementation, and any amendment to those formulas would go
 * unnoticed while stage deltas get misattributed to "model changes".
 *
 * The fingerprint therefore evaluates each cohort schedule over its full
 * legal span and freezes the outputs. It is used ONLY as an identity/drift
 * signal (like the engine-source digest), never as an expected value — the
 * independent anchors for these very values remain the external golden tests.
 */

import {
  aktienfondsTeilfreistellungPrivat,
  besteuerungsanteilGrv,
  ertragsanteilByAge,
  halbeinkuenfteMinAgeForContractStartYear,
  legalConstants,
  pvBeitragszuschlagKinderloseMinAge,
  sonderausgabenPauschbetrag,
  versorgungsfreibetrag,
  werbungskostenPauschalRenten,
  werbungskostenPauschalVersorgungsbezuege,
} from '../../rules/legalConstants'

const FIRST_RETIREMENT_YEAR = 2005
const LAST_RETIREMENT_YEAR = 2060
const FIRST_CONTRACT_START_YEAR = 1990
const LAST_CONTRACT_START_YEAR = 2030
const MIN_ERTRAGSANTEIL_AGE = 55
const MAX_ERTRAGSANTEIL_AGE = 75

export interface RulesFingerprint {
  legalConstants: Record<string, unknown>
  /** Plain constants exported alongside the `legalConstants` object. */
  standaloneConstants: {
    werbungskostenPauschalVersorgungsbezuege: number
    werbungskostenPauschalRenten: number
    sonderausgabenPauschbetrag: { single: number; married: number }
    aktienfondsTeilfreistellungPrivat: number
    pvBeitragszuschlagKinderloseMinAge: number
  }
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

/** Evaluated cohort schedules + all cross-year constants, as canonical JSON input. */
export function rulesFingerprint(): RulesFingerprint {
  const besteuerungsanteil: Record<string, number> = {}
  const freibetrag: RulesFingerprint['versorgungsfreibetragByRetirementYear'] = {}
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
    legalConstants,
    standaloneConstants: {
      werbungskostenPauschalVersorgungsbezuege,
      werbungskostenPauschalRenten,
      sonderausgabenPauschbetrag: { ...sonderausgabenPauschbetrag },
      aktienfondsTeilfreistellungPrivat,
      pvBeitragszuschlagKinderloseMinAge,
    },
    besteuerungsanteilGrvByRetirementYear: besteuerungsanteil,
    versorgungsfreibetragByRetirementYear: freibetrag,
    ertragsanteilByPayoutAge: ertragsanteil,
    halbeinkuenfteMinAgeByContractStartYear: halbeinkuenfteMinAge,
  }
}
