export type ProductId = 'etf' | 'bav' | 'versicherung' | 'basisrente' | 'altersvorsorgedepot' | 'riester'

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
