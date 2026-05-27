/**
 * Pure helper — normalize → sync → simulate for compare-mode simulations
 * that must show all products (or a caller-supplied subset), regardless of
 * what the user's current `visibleProducts` filter contains.
 *
 * Shared by:
 *   - `Calculator.tsx` compareAllProductsSimulation memo (CSV export source)
 *   - `VergleichPage.tsx` localAllProductsResult fallback memo
 *   - `PrintReport.tsx` allProductsResult fallback memo
 *
 * `useSimulationResult` uses the LIVE `assumptions.visibleProducts` and is
 * intentionally NOT routed through this helper — its contract differs.
 *
 * PR 332 R3 — extracted from 3 identical inline duplications.
 */

import { simulateRetirementComparison } from '../engine/simulate'
import { de2026Rules } from '../rules/de2026'
import { PRODUCT_IDS } from '../engine/productRegistry'
import {
  normalizeMonthlyNettoBelastung,
  syncMonthlyContributions,
} from './syncContributions'
import { DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR } from '../data/defaultScenario'
import type { PersonalProfile, ProductId, ScenarioAssumptions } from '../domain'

/**
 * Build a compare-mode simulation with `visibleProducts` forced to
 * `productIds` (defaults to all 6 from `PRODUCT_IDS`).
 *
 * Mirrors `useSimulationResult`'s construction exactly: normalize the monthly
 * netto-belastung, then `syncMonthlyContributions` so the bAV two-pass
 * funding and the fair-comparison invariant still hold.
 */
export function buildAllProductsSimulation(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
  productIds: readonly ProductId[] = PRODUCT_IDS,
): ReturnType<typeof simulateRetirementComparison> {
  const overridden: ScenarioAssumptions = {
    ...assumptions,
    visibleProducts: [...productIds] as ProductId[],
  }
  const activeAssumptions = syncMonthlyContributions(
    normalizeMonthlyNettoBelastung(
      overridden.equalInputAmountEUR ?? DEFAULT_MONTHLY_NETTO_BELASTUNG_EUR,
    ),
    overridden,
    profile,
    de2026Rules,
  )
  return simulateRetirementComparison(profile, activeAssumptions, de2026Rules)
}
