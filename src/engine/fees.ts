/**
 * Reduction in Yield (RIY) / Effektivkosten for the accumulation phase.
 *
 * Regulatory basis:
 *   - PRIIPs Delegated Regulation (EU) 2017/653, Annex VI/VII: the summary cost
 *     indicator is the difference between the cost-free scenario annual return and
 *     the annual return from investor payments to benefit payments over the
 *     recommended holding period.
 *   - VVG-InfoV § 2 Abs. 1 Nr. 9 requires pre-contract life-insurance disclosure of
 *     this percentage-point cost reduction; § 2 Abs. 6 ties it to Annex VI of
 *     Delegated Regulation (EU) 2017/653.
 *   - BaFin describes "Effektivkosten" as the impact of total policyholder costs on
 *     the annual return for insurance-based investment products.
 *
 * Definition: the constant annual return reduction (as a decimal, e.g. 0.012 = 1.2 pp)
 * that, when subtracted from the gross return and applied with zero explicit fees,
 * produces the same terminal capital as the actual fee-laden product.
 *
 * Scope: accumulation phase only (investor payments → terminal capital). Does not
 * include retirement payout-phase fees. When the caller supplies a product-specific
 * zero-fee capital, both projections keep the same tax accrual policy (including
 * Vorabpauschale): taxes remain on both sides so the reported reduction isolates fees.
 *
 * Method: bisection on the beginning-of-period annuity future-value formula.
 * The closed-form FV is a good proxy for the simulation because the dominant fee
 * (asset management drag) is multiplicative and the formula captures it correctly.
 * Contribution-fee and fixed-fee effects are captured implicitly via the lower
 * terminal capital passed in.
 *
 * Typical ranges (from BAV_RESEARCH.md): 0.2–0.5 pp for low-cost ETF wrappers,
 * 0.8–1.0 pp for net-tariff bAV, 1.3–1.7 pp for standard-provision bAV,
 * 2.0 pp+ for expensive contracts.
 */

export function computeRIY(
  monthlyContribution: number,
  months: number,
  grossAnnualReturn: number,
  capitalWithFees: number,
  capitalWithoutFees?: number,
): number {
  if (months <= 0 || monthlyContribution <= 0 || capitalWithFees <= 0) return 0

  // Beginning-of-period annuity FV at annual return r.
  // Contributions are invested at the start of each month, then grow for the remaining months.
  const fv = (r: number): number => {
    const r_m = Math.pow(1 + r, 1 / 12) - 1
    if (Math.abs(r_m) < 1e-12) return monthlyContribution * months
    return (monthlyContribution * (Math.pow(1 + r_m, months) - 1) / r_m) * (1 + r_m)
  }

  const solveAnnualReturn = (targetCapital: number, upperBound: number): number | null => {
    let lo = -0.999
    let hi = upperBound

    if (fv(lo) > targetCapital || fv(hi) < targetCapital) return null

    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (fv(mid) < targetCapital) lo = mid
      else hi = mid
    }

    return (lo + hi) / 2
  }

  // A product-specific zero-fee terminal capital lets callers preserve a
  // custom gross return path (for example the AVD Standarddepot glidepath).
  // Both terminal capitals are converted through the same annuity convention,
  // so allocation drag is not mislabeled as cost.
  const effectiveGrossAnnualReturn = capitalWithoutFees === undefined
    ? grossAnnualReturn
    : solveAnnualReturn(capitalWithoutFees, Math.max(grossAnnualReturn, 1))

  if (effectiveGrossAnnualReturn === null) return 0

  const fvAtGross = fv(effectiveGrossAnnualReturn)

  // If capital with fees equals or exceeds the no-fee gross FV (e.g. large employer subsidy
  // relative to fees), fees are effectively zero or negative — report 0.
  if (capitalWithFees >= fvAtGross) return 0

  // Bisection: fv is monotone increasing in r. We want fv(r_net) to match the
  // fee-bearing capital while staying below the product's effective gross rate.
  const effectiveNetAnnualReturn = solveAnnualReturn(
    capitalWithFees,
    effectiveGrossAnnualReturn,
  )

  return effectiveNetAnnualReturn === null
    ? 0
    : Math.max(0, effectiveGrossAnnualReturn - effectiveNetAnnualReturn)
}
