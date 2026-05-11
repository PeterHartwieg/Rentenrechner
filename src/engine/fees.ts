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
 * include retirement payout-phase fees or taxes.
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
): number {
  if (months <= 0 || monthlyContribution <= 0 || capitalWithFees <= 0) return 0

  // Beginning-of-period annuity FV at annual return r.
  // Contributions are invested at the start of each month, then grow for the remaining months.
  const fv = (r: number): number => {
    const r_m = Math.pow(1 + r, 1 / 12) - 1
    if (Math.abs(r_m) < 1e-12) return monthlyContribution * months
    return (monthlyContribution * (Math.pow(1 + r_m, months) - 1) / r_m) * (1 + r_m)
  }

  const fvAtGross = fv(grossAnnualReturn)

  // If capital with fees equals or exceeds the no-fee gross FV (e.g. large employer subsidy
  // relative to fees), fees are effectively zero or negative — report 0.
  if (capitalWithFees >= fvAtGross) return 0

  // Bisection: fv is monotone increasing in r.
  // We want fv(r_net) = capitalWithFees, r_net < grossAnnualReturn.
  let lo = -0.999
  let hi = grossAnnualReturn

  // Sanity: if even fv(-99.9%) > capitalWithFees the problem has no solution — return 0.
  if (fv(lo) > capitalWithFees) return 0

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (fv(mid) < capitalWithFees) lo = mid
    else hi = mid
  }

  return Math.max(0, grossAnnualReturn - (lo + hi) / 2)
}
