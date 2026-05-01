import type { PayoutMode } from '../domain'

export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1
}

export function monthlyPayoutFromCapital(
  capital: number,
  annualReturn: number,
  payoutYears: number,
): number {
  const months = Math.max(1, Math.round(payoutYears * 12))
  const rate = monthlyRate(Math.max(-0.99, annualReturn))

  if (Math.abs(rate) < 0.000001) {
    return capital / months
  }

  return (capital * rate) / (1 - Math.pow(1 + rate, -months))
}

/**
 * Computes the gross monthly retirement payout based on the contractual payout mode (#54).
 *
 * - leibrente: gross = capital / 10 000 × rentenfaktor. The insurer takes the capital
 *   and pays a contractually fixed monthly amount for life. The calculator does not
 *   model death timing — payments are reported as a stable monthly figure regardless
 *   of the user's chosen `retirementEndAge`.
 * - zeitrente: capital depletes over `zeitrenteYears` (contractual fixed term).
 * - kapitalverzehr: capital depletes over the user-chosen `kapitalverzehrYears`
 *   (= retirementEndAge − retirementAge), modelled as a self-managed drawdown plan.
 */
export function computeGrossMonthlyPayout(
  capital: number,
  cfg: {
    mode: PayoutMode
    rentenfaktor: number
    zeitrenteYears: number
    kapitalverzehrYears: number
    payoutReturn: number
  },
): number {
  if (capital <= 0) return 0
  if (cfg.mode === 'leibrente') {
    return Math.max(0, (capital / 10_000) * cfg.rentenfaktor)
  }
  const years = cfg.mode === 'zeitrente' ? cfg.zeitrenteYears : cfg.kapitalverzehrYears
  if (years <= 0) return 0
  return monthlyPayoutFromCapital(capital, cfg.payoutReturn, years)
}
