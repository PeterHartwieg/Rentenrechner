/**
 * Shared fee preset definitions consumed by BavInputs, InsuranceInputs, and
 * CombineDashboardSidebar.
 *
 * Full presets (BAV_FEE_PRESETS / PAV_FEE_PRESETS) are the canonical sets used
 * in the compare-mode inputs panel. The simplified variant (SIMPLIFIED_PRESETS)
 * is a condensed subset for the combine-mode sidebar context where screen
 * real-estate is tighter.
 *
 * Both sets are exported from this module so all consumers stay in sync without
 * duplication.
 */

import type { FeeModel } from '../../../domain'

export interface FeePreset {
  label: string
  fees: FeeModel
}

const BASE_FEE: Pick<FeeModel, 'acquisitionCostSpreadYears'> = { acquisitionCostSpreadYears: 5 }

// ---------------------------------------------------------------------------
// Full presets — used by BavInputs and InsuranceInputs
// ---------------------------------------------------------------------------

/** bAV fee presets (compare-mode InputsPanel). */
export const BAV_FEE_PRESETS: FeePreset[] = [
  {
    label: 'Nettotarif',
    fees: { wrapperAssetFee: 0.003, fundAssetFee: 0.002, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
  {
    label: 'Standard',
    fees: { wrapperAssetFee: 0.006, fundAssetFee: 0.002, contributionFee: 0.045, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Hochkosten',
    fees: { wrapperAssetFee: 0.007, fundAssetFee: 0.002, contributionFee: 0.0975, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Hoher AG-Match',
    fees: { wrapperAssetFee: 0.007, fundAssetFee: 0.002, contributionFee: 0.045, fixedMonthlyFee: 0, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
]

/** pAV fee presets (compare-mode InputsPanel). */
export const PAV_FEE_PRESETS: FeePreset[] = [
  {
    label: 'Nettotarif',
    fees: { wrapperAssetFee: 0.004, fundAssetFee: 0.002, contributionFee: 0, fixedMonthlyFee: 0, acquisitionCostPct: 0, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
  {
    label: 'Standard',
    fees: { wrapperAssetFee: 0.003, fundAssetFee: 0.002, contributionFee: 0, fixedMonthlyFee: 3, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0.015, ...BASE_FEE },
  },
  {
    label: 'Hochkosten',
    fees: { wrapperAssetFee: 0.008, fundAssetFee: 0.0025, contributionFee: 0.09, fixedMonthlyFee: 5, acquisitionCostPct: 0.04, pensionPayoutFeePct: 0.0175, ...BASE_FEE },
  },
  {
    label: 'Altvertrag',
    fees: { wrapperAssetFee: 0.012, fundAssetFee: 0.002, contributionFee: 0.03, fixedMonthlyFee: 5, acquisitionCostPct: 0.025, pensionPayoutFeePct: 0, ...BASE_FEE },
  },
]

// ---------------------------------------------------------------------------
// Simplified presets — condensed subset for the combine-mode sidebar
// ---------------------------------------------------------------------------

/**
 * Two-entry simplified set for the CombineDashboardSidebar, where screen
 * real-estate is tighter than the full compare-mode InputsPanel.
 */
export const SIMPLIFIED_PRESETS: FeePreset[] = [
  {
    label: 'Nettotarif ETF (0,8 %)',
    fees: {
      wrapperAssetFee: 0.005,
      fundAssetFee: 0.003,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
  {
    label: 'Bruttotarif (1,5 %)',
    fees: {
      wrapperAssetFee: 0.01,
      fundAssetFee: 0.005,
      contributionFee: 0.03,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
]
