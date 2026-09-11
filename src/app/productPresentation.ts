import type { BavAssumptions } from '../domain'
export { getProductMeta, PRODUCT_MANIFEST } from '../engine/productManifest'
// Fee presets live in the sections package; re-export for backward-compat callers.
export { BAV_FEE_PRESETS, PAV_FEE_PRESETS } from '../features/inputs/sections/feePresets'

/** GRV has no product module — keep its colour here as a standalone constant. */
export const GRV_COLOR = '#16a34a'

/**
 * §1a Abs. 1a BetrAVG statutory minimum AG-Zuschuss in percent of converted salary.
 * Mirrors `rules.bav.statutoryEmployerSubsidyPct` (= 0.15). Kept in pp here so UI
 * components can present a single "AG-Zuschuss (gesamt)" field without rounding noise.
 *
 * The ProductEditCards "Annahmen anpassen" panel lets the user enter a *total*
 * AG-Zuschuss (statutory + contractual); these helpers split that total back
 * into the statutory toggle + contractual percentage stored on BavAssumptions.
 */
export const STATUTORY_BAV_SUBSIDY_PCT = 15

/** Effective AG-Zuschuss percentage as it should appear in a single "total" UI field. */
export function bavTotalMatchPct(
  bav: Pick<BavAssumptions, 'statutoryMinimumSubsidyEnabled' | 'contractualMatchPercent'>,
): number {
  return (
    (bav.statutoryMinimumSubsidyEnabled ? STATUTORY_BAV_SUBSIDY_PCT : 0) +
    bav.contractualMatchPercent * 100
  )
}

/**
 * Split a "total" AG-Zuschuss (in percent) back into the statutory toggle + contractual
 * percentage stored on `BavAssumptions`. Statutory stays on for any positive total —
 * §1a Abs. 1a is non-waivable for new contracts and the engine already caps the
 * statutory leg at the actual AG SV saving.
 */
export function applyBavTotalMatch(totalPct: number): {
  statutoryMinimumSubsidyEnabled: boolean
  contractualMatchPercent: number
} {
  return {
    statutoryMinimumSubsidyEnabled: true,
    contractualMatchPercent: Math.max(0, totalPct - STATUTORY_BAV_SUBSIDY_PCT) / 100,
  }
}

export { CALCULATION_NOTES as CALCULATION_WARNINGS, BADGE_LABEL } from '../content/calculationNotes'
export type { WarningStatus } from '../content/calculationNotes'
