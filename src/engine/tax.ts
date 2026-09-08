import type { GermanRules } from '../domain'
import { legalConstants } from '../rules/legalConstants'

const floorEuro = (value: number) => Math.floor(Math.max(0, value))

/**
 * §32a EStG Einkommensteuer-Grundtarif.
 *
 * Every tariff input — zone boundaries and formula coefficients — comes from
 * the active rule set (`rules.incomeTax`); this function holds no statutory
 * literals of its own. The coefficients are re-issued per assessment period
 * together with the zone boundaries, so they live in the year file
 * (`src/rules/de2026.ts` → `incomeTax.tariff`), not in `legalConstants.ts`.
 *
 * Formula (x = zu versteuerndes Einkommen, floored to full euros):
 *   a: x ≤ basicAllowance              → 0
 *   b: ≤ firstProgressionEnd   est = (c1·y + c2)·y,        y = (x − basicAllowance)/10 000
 *   c: ≤ secondProgressionEnd  est = (c3·z + c4)·z + c5,   z = (x − firstProgressionEnd)/10 000
 *   d: < topTaxStart           est = 0.42·x − d1
 *   e: ≥ topTaxStart           est = 0.45·x − d2
 *
 * The `Math.floor` at every zone end is statutory tariff rounding (the
 * formula applies to the zu versteuerndes Einkommen floored to full euros
 * and yields full euros), not display rounding. This floor behavior and the
 * zone-boundary comparisons are pinned by the BMF tariff goldens in
 * `src/test/externalGoldenFixtures.ts`.
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
    return Math.floor((tariff.zoneBLinear * y + tariff.zoneBConstant) * y)
  }

  if (x <= secondProgressionEnd) {
    const z = (x - firstProgressionEnd) / tariff.progressionDenominator
    return Math.floor((tariff.zoneCLinear * z + tariff.zoneCQuadratic) * z + tariff.zoneCConstant)
  }

  if (x < topTaxStart) {
    return Math.floor(tariff.proportionalRate * x - tariff.proportionalDeduction)
  }

  return Math.floor(tariff.topRate * x - tariff.topRateDeduction)
}

/**
 * Solidaritätszuschlag (§3, §4 SolzG 1995).
 *
 * Rate and Milderungszone slope are cross-year statutory constants
 * (`legalConstants.soli`); the Freigrenze is year-specific
 * (`rules.incomeTax.solidarityFreeTax*`, §3 Abs. 3 SolzG).
 *
 * Formula: 0 below the Freigrenze; above it the lesser of
 *   regular     = ESt × 5.5 %
 *   transition  = (ESt − Freigrenze) × 11.9 %   (Milderungszone)
 * floored implicitly at 0 by the outer max.
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
