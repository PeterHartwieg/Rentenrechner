import type { GermanRules } from '../domain/types'

export interface BavMinimumEntitlement {
  /** Minimum annual conversion — 1/160 of annual Bezugsgröße West (§1a BetrAVG) */
  annualMin: number
  /** Minimum monthly conversion — annualMin / 12 */
  monthlyMin: number
}

/**
 * Computes the §1a BetrAVG minimum-conversion thresholds from the statutory rules.
 *
 * Statutory basis: §1a Abs. 1 S. 1 BetrAVG — the employee may demand conversion of
 * at least 1/160 of the *annual* Bezugsgröße West (§18 Abs. 1 SGB IV).
 *
 * 2026 example: 3 955 EUR/Monat × 12 = 47 460 EUR/Jahr → 47 460 / 160 = 296.625 EUR/Jahr
 *               monthly equivalent: 296.625 / 12 ≈ 24.72 EUR/Monat
 */
export function computeBavMinimumEntitlement(rules: GermanRules): BavMinimumEntitlement {
  const annualBezugsgroesse = rules.socialSecurity.bezugsgroesseMonthly * 12
  const annualMin = annualBezugsgroesse / 160
  const monthlyMin = annualMin / 12
  return { annualMin, monthlyMin }
}
