export interface EtfAssumptions {
  annualAssetFee: number
  equityPartialExemption: number
  /**
   * Optional Beitragsdynamik: annual contribution-growth rate (decimal). Each
   * year's monthly contribution scales by `(1 + rate)^yearIndex`. 0 = static
   * (default).
   */
  annualContributionGrowthRate: number
}
