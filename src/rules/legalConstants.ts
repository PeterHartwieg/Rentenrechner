/**
 * Cross-year statutory constants. Values that depend on the legal framework
 * itself, not on the annual rate-setting cycle (BBG, GKV Zusatzbeitrag,
 * Rentenwert, durchschnittsentgelt, Basiszins).
 *
 * Update only when the underlying law changes (e.g. an amendment to §229
 * SGB V or §34 EStG). For yearly rate updates see `de2026.ts` (or the
 * corresponding year-specific file).
 */

// ---------------------------------------------------------------------------
// Cohort lookup helpers for retirement-phase income tax (#46).
//
// These live here — not in the year-pinned `de2026.ts` — because they are
// conceptually cross-year: `besteuerungsanteilGrv` and `versorgungsfreibetrag`
// are parametrised cohort tables that span 2005–2058+; the three Pauschbetrag
// constants change only on actual law amendment (not annual rate-setting).
// Keeping them here means `src/rules/index.ts` does not need a year-pinned
// re-export shim that would silently drift when the active rule year flips.
// ---------------------------------------------------------------------------

/**
 * Fraction of statutory pension (GRV-Rente) that is taxable, per cohort.
 *
 * Statutory basis: §22 Nr. 1 Satz 3 Buchstabe a Doppelbuchstabe aa EStG,
 *   as amended by the Wachstumschancengesetz (BGBl. 2024 I Nr. 108, in
 *   force 28 March 2024) which slowed the pace of increase from 1 pp/year
 *   to 0.5 pp/year starting from the 2023 cohort.
 *
 * Source: §22 EStG, Anlage; Wachstumschancengesetz Art. 19 Nr. 8 (amending
 *   §52 Abs. 34 EStG transition table).
 *   https://www.gesetze-im-internet.de/estg/__22.html
 *   https://www.bundesrat.de/SharedDocs/drucksachen/2024/0001-0100/
 *     036-24.pdf (Wachstumschancengesetz — Anlage)
 *
 * Schedule (post-Wachstumschancengesetz):
 *   2023: 82.5 %  (anchor — last value before slowed progression locked in)
 *   2024: 83.0 %
 *   2025: 83.5 %
 *   2026: 84.0 %
 *   ...+0.5 pp/year...
 *   2058: 100.0 %  (maximum, stays at 100 % thereafter)
 *
 * For years before 2023 the table returns values from the pre-Wachstumschancengesetz
 * progression (1 pp/year from 50 % in 2005), clamped at 82.5 % for 2023.
 */
export function besteuerungsanteilGrv(retirementYear: number): number {
  if (retirementYear <= 2005) return 0.50
  if (retirementYear >= 2058) return 1.00

  if (retirementYear <= 2022) {
    // Pre-Wachstumschancengesetz schedule:
    // 2005 = 50 %, 2006 = 52 %, ..., 2020 = 80 %, 2021 = 81 %, 2022 = 82 %
    // (+2 pp/year 2005→2020, then +1 pp/year 2020→2022)
    if (retirementYear <= 2020) {
      return 0.50 + (retirementYear - 2005) * 0.02
    }
    return 0.80 + (retirementYear - 2020) * 0.01
  }

  // Post-Wachstumschancengesetz (2023–2058): +0.5 pp/year
  return 0.825 + (retirementYear - 2023) * 0.005
}

/**
 * Versorgungsfreibetrag for bAV-Renten and other Versorgungsbezüge (§19 Abs. 2 EStG).
 *
 * The Freibetrag locks at the retirement year and does not change in subsequent
 * years (§19 Abs. 2 Satz 7 EStG: "maßgeblicher Versorgungsbeginn").
 *
 * Two parts are returned:
 *   prozent     — percentage of gross Versorgungsbezüge, capped at hoechstbetrag
 *   hoechstbetrag — annual cap (EUR)
 *   zuschlag    — Zuschlag zum Versorgungsfreibetrag (EUR, added unconditionally)
 *
 * Statutory basis: §19 Abs. 2 EStG (Versorgungsfreibetrag + Zuschlag),
 *   as amended by Wachstumschancengesetz (slowed progression to 0 by 2058).
 *
 * Source: §19 Abs. 2 EStG transition table (Anlage); Wachstumschancengesetz.
 *   https://www.gesetze-im-internet.de/estg/__19.html
 *
 * Anchor values (verified against EStG §19 Abs. 2 Satz 3, Anlage 1):
 *   2023: 14.0 % / 1,050 EUR / 315 EUR
 *   2024: 13.6 % / 1,020 EUR / 306 EUR
 *   2025: 13.2 % /   990 EUR / 297 EUR  ← slowed by Wachstumschancengesetz
 *   2026: 12.8 % /   960 EUR / 288 EUR
 *   ...−0.4 pp/year, −30 EUR/year, −9 EUR/year...
 *   2058:  0.0 % /     0 EUR /   0 EUR
 *
 * For years 2005–2022 the pre-Wachstumschancengesetz schedule applies
 * (faster pace; values above the 2023 anchor). For years >= 2058: all zeros.
 * For years < 2005 (no Alterseinkünftegesetz): returns 2005 values (40 %/3000/900).
 */
export interface VersorgungsfreibetragRow {
  prozent: number       // e.g. 0.128 for 12.8 %
  hoechstbetrag: number // annual cap EUR
  zuschlag: number      // Zuschlag EUR
}

export function versorgungsfreibetrag(retirementYear: number): VersorgungsfreibetragRow {
  if (retirementYear < 2005) {
    // Extrapolate backward: use the 2005 value (Alterseinkünftegesetz start)
    return { prozent: 0.40, hoechstbetrag: 3_000, zuschlag: 900 }
  }
  if (retirementYear >= 2058) {
    return { prozent: 0, hoechstbetrag: 0, zuschlag: 0 }
  }

  if (retirementYear <= 2022) {
    // Pre-Wachstumschancengesetz schedule (EStG §19 Abs. 2 original table):
    // 2005: 40.0 % / 3,000 / 900
    // 2006: 38.4 % / 2,880 / 864
    // ...−1.6 pp/year, −120 EUR/year, −36 EUR/year... → 2040: 0 %
    // For 2023 anchor (14.0/1050/315) this matches the pre-law 2023 row.
    const yearsFrom2005 = retirementYear - 2005
    return {
      prozent: 0.40 - yearsFrom2005 * 0.016,
      hoechstbetrag: 3_000 - yearsFrom2005 * 120,
      zuschlag: 900 - yearsFrom2005 * 36,
    }
  }

  // Post-Wachstumschancengesetz (2023–2057): −0.4 pp/year, −30 EUR/year, −9 EUR/year
  const yearsFrom2023 = retirementYear - 2023
  return {
    prozent: Math.max(0, 0.140 - yearsFrom2023 * 0.004),
    hoechstbetrag: Math.max(0, 1_050 - yearsFrom2023 * 30),
    zuschlag: Math.max(0, 315 - yearsFrom2023 * 9),
  }
}

// ---------------------------------------------------------------------------
// Pauschbeträge for retirement-phase income-tax computation (#46)
// ---------------------------------------------------------------------------

/**
 * §9a Satz 1 Nr. 1b EStG: Werbungskosten-Pauschbetrag for Versorgungsbezüge (bAV-Renten etc.).
 * 102 EUR/year. Has been 102 EUR since 2005 (no change).
 * Source: https://www.gesetze-im-internet.de/estg/__9a.html
 */
export const werbungskostenPauschalVersorgungsbezuege = 102

/**
 * §9a Satz 1 Nr. 3 EStG: Werbungskosten-Pauschbetrag for sonstige Einkünfte (Renten).
 * 102 EUR/year since 2023 (raised from 102 → kept at 102 by Inflationsausgleichsgesetz).
 * Source: https://www.gesetze-im-internet.de/estg/__9a.html
 */
export const werbungskostenPauschalRenten = 102

/**
 * §10c EStG: Sonderausgaben-Pauschbetrag.
 * Single: 36 EUR/year. Married (joint assessment): 72 EUR/year.
 * Source: https://www.gesetze-im-internet.de/estg/__10c.html
 */
export const sonderausgabenPauschbetrag = { single: 36, married: 72 }

export const legalConstants = {
  insurance: {
    /** Boundary year for old-contract tax-free treatment per §52 Abs. 28 EStG a.F. */
    pre2005YearBoundary: 2005,
    /** Minimum contract runtime (years) for Halbeinkünfteverfahren / pre-2005 tax-free (§20 Abs. 1 Nr. 6 EStG; §52 Abs. 28 EStG a.F.). */
    halbeinkuenfteMinRuntimeYears: 12,
    /** Base minimum payout age for Halbeinkünfteverfahren (§20 Abs. 1 Nr. 6 EStG). */
    halbeinkuenfteMinAgePre2012Contracts: 60,
    /** Contract-start year from which §52 Abs. 28 Satz 7 EStG raises the minimum payout age to 62. */
    halbeinkuenfteRaisedMinAgeContractStartYear: 2012,
    /** Raised minimum payout age for contracts concluded after 31 Dec 2011 (§52 Abs. 28 Satz 7 EStG). */
    halbeinkuenfteMinAgePost2011Contracts: 62,
    /** Halbeinkünfte factor — only half the gain enters the personal-tax base (§20 Abs. 1 Nr. 6 EStG). */
    halbeinkuenfteFactor: 0.5,
  },
  bav: {
    /** §229 Abs. 1 Satz 3 SGB V: Versorgungsbezüge lump sums spread over 120 months for KV/PV. */
    versorgungsbezugSpreadingMonths: 120,
    /** §34 Abs. 1 EStG Fünftelregelung divisor: tax = 5 × (T(other + lumpSum/5) − T(other)). */
    fuenftelregelungDivisor: 5,
  },
  basisrente: {
    /** §10 Abs. 1 Nr. 2 b Doppelbuchst. aa EStG / AltZertG §2: earliest old-age payout age for a certified Basisrentenvertrag. */
    minPayoutAge: 62,
  },
  payrollTax: {
    /** §39b Abs. 2 Satz 2 EStG: upper scaling factor for the Steuerklasse V/VI tariff formula 2 × (f(1.25x) − f(0.75x)). */
    taxClassVVIUpperFactor: 1.25,
    /** §39b Abs. 2 Satz 2 EStG: lower scaling factor for the Steuerklasse V/VI tariff formula 2 × (f(1.25x) − f(0.75x)). */
    taxClassVVILowerFactor: 0.75,
  },
} as const

export function halbeinkuenfteMinAgeForContractStartYear(contractStartYear: number): number {
  const {
    halbeinkuenfteMinAgePre2012Contracts,
    halbeinkuenfteRaisedMinAgeContractStartYear,
    halbeinkuenfteMinAgePost2011Contracts,
  } = legalConstants.insurance

  return contractStartYear >= halbeinkuenfteRaisedMinAgeContractStartYear
    ? halbeinkuenfteMinAgePost2011Contracts
    : halbeinkuenfteMinAgePre2012Contracts
}

/**
 * Ertragsanteil für lebenslange Leibrenten nach §22 Nr. 1 Satz 3 a aa EStG (Anlage 1 zu §22).
 * Returns the fraction (0–1) of each pension payment that is taxable at the personal income-tax rate.
 * Applies to ungefoerderte private Leibrenten (Schicht 3); NOT to bAV (§22 Nr. 5 EStG) or GRV.
 *
 * The remaining fraction is treated as a tax-free capital-return component.
 * Source: §22 Nr. 1 Satz 3 a aa EStG — Anlage 1 (Ertragsanteilstabelle).
 *
 * @param age - vollendetes Lebensjahr bei Beginn der Rente (age at annuity start)
 */
export function ertragsanteilByAge(age: number): number {
  // §22 Nr. 1 Satz 3 a aa EStG — Anlage 1 (Ertragsanteilstabelle für lebenslange Leibrenten).
  // Monotonically non-increasing from 59 % (age 0) to 1 % (age 89+).
  // Key values confirmed: 62 → 21 %, 65–66 → 18 %, 67 → 17 %, 69–70 → 15 % (backlog #59).
  // Returns a fraction in [0, 1].
  const table: Record<number, number> = {
     0: 0.59,  1: 0.59,  2: 0.58,  3: 0.57,  4: 0.57,
     5: 0.56,  6: 0.55,  7: 0.55,  8: 0.54,  9: 0.53,
    10: 0.53, 11: 0.52, 12: 0.52, 13: 0.51, 14: 0.50,
    15: 0.50, 16: 0.49, 17: 0.49, 18: 0.48, 19: 0.48,
    20: 0.47, 21: 0.47, 22: 0.46, 23: 0.45, 24: 0.45,
    25: 0.44, 26: 0.44, 27: 0.43, 28: 0.43, 29: 0.42,
    30: 0.42, 31: 0.41, 32: 0.41, 33: 0.40, 34: 0.39,
    35: 0.39, 36: 0.38, 37: 0.38, 38: 0.37, 39: 0.36,
    40: 0.36, 41: 0.35, 42: 0.35, 43: 0.34, 44: 0.34,
    45: 0.33, 46: 0.33, 47: 0.32, 48: 0.32, 49: 0.31,
    50: 0.30, 51: 0.30, 52: 0.29, 53: 0.28, 54: 0.27,
    55: 0.26, 56: 0.26, 57: 0.25, 58: 0.24, 59: 0.24,
    60: 0.23, 61: 0.22, 62: 0.21, 63: 0.20, 64: 0.19,
    65: 0.18, 66: 0.18, 67: 0.17, 68: 0.17,
    69: 0.15, 70: 0.15, 71: 0.14, 72: 0.14,
    73: 0.13, 74: 0.13, 75: 0.11, 76: 0.10,
    77: 0.09, 78: 0.08, 79: 0.08, 80: 0.07,
    81: 0.06, 82: 0.05, 83: 0.05, 84: 0.04,
    85: 0.03, 86: 0.03, 87: 0.02, 88: 0.02,
    89: 0.01,
  }
  const clamped = Math.max(0, Math.min(89, Math.floor(age)))
  return table[clamped] ?? 0.01
}
