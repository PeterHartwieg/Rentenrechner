/**
 * Cross-year statutory constants. Values that depend on the legal framework
 * itself, not on the annual rate-setting cycle (BBG, GKV Zusatzbeitrag,
 * Rentenwert, durchschnittsentgelt, Basiszins).
 *
 * Update only when the underlying law changes (e.g. an amendment to §229
 * SGB V or §34 EStG). For yearly rate updates see `de2026.ts` (or the
 * corresponding year-specific file).
 */
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
