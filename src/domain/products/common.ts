// `ProductId` is the single source of truth for product identifiers and is derived
// from the registered products' `metadata.id` literals. See `engine/productRegistry.ts`.
// The import is type-only, so the cycle through engine -> products -> domain is
// erased at runtime.
export type { ProductId } from '../../engine/productRegistry'

/**
 * Retirement-phase payout mode for bAV and private-insurance contracts. (#54)
 *
 * - leibrente: Lifelong annuity priced via the contractual Rentenfaktor (EUR/Monat per
 *   10 000 EUR Kapital). Payments continue past `retirementEndAge`; the calculator does
 *   not model actuarial death timing. Capital is consumed by the insurer; the policyholder
 *   does not bear longevity risk. Basis: §1 Abs. 1 Satz 1 BetrAVG (Versorgungsleistungen
 *   "auf das Leben"). The Rentenfaktor lives in the Versicherungsbedingungen of each
 *   contract; a Garantierter Mindestrentenfaktor is typically named alongside the planned
 *   value.
 * - zeitrente: Fixed-term annuity over `zeitrenteYears`. Capital depletes over that
 *   contractual horizon, independent of the user's chosen `retirementEndAge`.
 * - kapitalverzehr: Drawdown plan — capital depletes over `retirementEndAge - retirementAge`.
 *   Models a self-managed withdrawal (the ETF default), not a contractual annuity.
 */
export type PayoutMode = 'leibrente' | 'zeitrente' | 'kapitalverzehr'

/**
 * Contractual capital floor at retirement. This is intentionally separate from
 * costs: product fees stay in the fee model, while this describes the guarantee
 * the provider promises after those costs have already been charged.
 */
export interface CapitalGuaranteeAssumptions {
  enabled: boolean
  /** 1 = 100% of product contributions, 0.8 = 80%, 0 = no capital floor. */
  floorPctOfContributions: number
}
