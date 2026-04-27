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
    /** Minimum age at payout for Halbeinkünfteverfahren (§20 Abs. 1 Nr. 6 EStG). */
    halbeinkuenfteMinAge: 62,
    /** Halbeinkünfte factor — only half the gain enters the personal-tax base (§20 Abs. 1 Nr. 6 EStG). */
    halbeinkuenfteFactor: 0.5,
  },
  bav: {
    /** §229 Abs. 1 Satz 3 SGB V: Versorgungsbezüge lump sums spread over 120 months for KV/PV. */
    versorgungsbezugSpreadingMonths: 120,
    /** §34 Abs. 1 EStG Fünftelregelung divisor: tax = 5 × (T(other + lumpSum/5) − T(other)). */
    fuenftelregelungDivisor: 5,
  },
} as const
