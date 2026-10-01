import type { GermanRules } from '../domain'
import { legalConstants } from '../rules/legalConstants'

export interface BavMinimumEntitlement {
  /** Minimum annual conversion — 1/160 of annual Bezugsgröße West (§1a BetrAVG) */
  annualMin: number
  /** Minimum monthly conversion — annualMin / 12 */
  monthlyMin: number
}

/**
 * Computes the §1a BetrAVG minimum-conversion thresholds from the statutory
 * rules: 1/`legalConstants.bav.minimumEntitlementDivisor` of the annual
 * Bezugsgröße West (§18 Abs. 1 SGB IV).
 */
export function computeBavMinimumEntitlement(rules: GermanRules): BavMinimumEntitlement {
  const annualBezugsgroesse = rules.socialSecurity.bezugsgroesseMonthly * 12
  const annualMin = annualBezugsgroesse / legalConstants.bav.minimumEntitlementDivisor
  const monthlyMin = annualMin / 12
  return { annualMin, monthlyMin }
}
