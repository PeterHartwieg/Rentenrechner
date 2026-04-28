export interface FeeModel {
  // #55: split from combined annualAssetFee — sum is the total ongoing capital drag
  wrapperAssetFee: number      // Versicherungsmantel / policy-value fee (% of capital p.a.)
  fundAssetFee: number         // Fonds / ETF OGC or TER (% of capital p.a.)
  contributionFee: number
  fixedMonthlyFee: number
  acquisitionCostPct: number
  acquisitionCostSpreadYears: number
  // #56: pension-phase administration fee (% of gross monthly payout, applied before income tax / KV/PV)
  pensionPayoutFeePct: number
}
