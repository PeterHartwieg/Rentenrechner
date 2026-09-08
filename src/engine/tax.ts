import type { GermanRules } from '../domain'
import { legalConstants } from '../rules/legalConstants'

const floorEuro = (value: number) => Math.floor(Math.max(0, value))

/**
 * §32a EStG Einkommensteuer-Grundtarif. All zone boundaries and formula
 * coefficients come from the active rule set (`rules.incomeTax`); see
 * `de2026.ts` and the provenance in `ruleMetadata.ts`. The Math.floor per
 * zone is statutory tariff rounding, not display rounding, and is pinned by
 * the BMF goldens in `src/test/externalGoldenFixtures.ts`.
 *
 * The function name keeps its historical "2026" suffix for compatibility;
 * the assessment period is fully determined by the passed rule set.
 */
export function calculateIncomeTax2026(
  taxableIncome: number,
  rules: GermanRules,
): number {
  const x = floorEuro(taxableIncome)
  const { basicAllowance, firstProgressionEnd, secondProgressionEnd, topTaxStart, tariff } =
    rules.incomeTax

  if (x <= basicAllowance) {
    return 0
  }

  if (x <= firstProgressionEnd) {
    const y = (x - basicAllowance) / tariff.progressionDenominator
    return Math.floor((tariff.zoneBQuadratic * y + tariff.zoneBLinear) * y)
  }

  if (x <= secondProgressionEnd) {
    const z = (x - firstProgressionEnd) / tariff.progressionDenominator
    return Math.floor((tariff.zoneCQuadratic * z + tariff.zoneCLinear) * z + tariff.zoneCConstant)
  }

  if (x < topTaxStart) {
    return Math.floor(tariff.proportionalRate * x - tariff.proportionalDeduction)
  }

  return Math.floor(tariff.topRate * x - tariff.topRateDeduction)
}

/**
 * Solidaritätszuschlag. Rate and Milderungszone slope are cross-year
 * constants (`legalConstants.soli`); the Freigrenze is year-specific
 * (`rules.incomeTax.solidarityFreeTax*`). Below the Freigrenze: 0; above it,
 * the lesser of the flat rate and the Milderungszone amount.
 */
export function calculateSolidarityTax(
  incomeTax: number,
  rules: GermanRules,
  filingStatus: 'single' | 'married' = 'single',
): number {
  const freeTax =
    filingStatus === 'married'
      ? rules.incomeTax.solidarityFreeTaxMarried
      : rules.incomeTax.solidarityFreeTax

  if (incomeTax <= freeTax) {
    return 0
  }

  const regular = incomeTax * legalConstants.soli.rate
  const transition = (incomeTax - freeTax) * legalConstants.soli.milderungszoneRate

  return Math.max(0, Math.min(regular, transition))
}

/**
 * Capital-gains tax (Abgeltungsteuer, §32d EStG) plus soli, after
 * Teilfreistellung and Sparerpauschbetrag.
 */
export function calculateCapitalGainsTax(
  gain: number,
  rules: GermanRules,
  partialExemption = 0,
  annualAllowance = rules.capitalGains.saverAllowance,
): number {
  const taxableGain = Math.max(0, gain * (1 - partialExemption) - annualAllowance)
  const capitalTax = taxableGain * rules.capitalGains.taxRate

  return capitalTax + capitalTax * rules.capitalGains.solidarityRate
}
