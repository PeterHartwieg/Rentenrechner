import type { FeeModel, PayoutMode } from '../domain'
import { computeGrossMonthlyPayout } from './payoutMath'

export function applyPensionPayoutFee(grossMonthlyPayout: number, fees: FeeModel): number {
  return fees.pensionPayoutFeePct > 0
    ? grossMonthlyPayout * (1 - fees.pensionPayoutFeePct)
    : grossMonthlyPayout
}

export function computeFeeAdjustedGrossMonthlyPayout(
  capital: number,
  cfg: {
    mode: PayoutMode
    rentenfaktor: number
    zeitrenteYears: number
    kapitalverzehrYears: number
    payoutReturn: number
  },
  fees: FeeModel,
): number {
  return applyPensionPayoutFee(computeGrossMonthlyPayout(capital, cfg), fees)
}

export function calculateLeibrenteBreakEvenAge(
  retirementAge: number,
  capital: number,
  grossMonthlyPayout: number,
  enabled: boolean,
): number | undefined {
  return enabled && grossMonthlyPayout > 0
    ? retirementAge + capital / (grossMonthlyPayout * 12)
    : undefined
}
