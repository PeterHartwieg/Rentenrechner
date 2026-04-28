import type { GermanRules } from '../domain'

const floorEuro = (value: number) => Math.floor(Math.max(0, value))

export function calculateIncomeTax2026(
  taxableIncome: number,
  rules: GermanRules,
): number {
  const x = floorEuro(taxableIncome)
  const { basicAllowance, firstProgressionEnd, secondProgressionEnd, topTaxStart } =
    rules.incomeTax

  if (x <= basicAllowance) {
    return 0
  }

  if (x <= firstProgressionEnd) {
    const y = (x - basicAllowance) / 10_000
    return Math.floor((914.51 * y + 1_400) * y)
  }

  if (x <= secondProgressionEnd) {
    const z = (x - firstProgressionEnd) / 10_000
    return Math.floor((173.1 * z + 2_397) * z + 1_034.87)
  }

  if (x < topTaxStart) {
    return Math.floor(0.42 * x - 11_135.63)
  }

  return Math.floor(0.45 * x - 19_470.38)
}

export function calculateSolidarityTax(incomeTax: number, rules: GermanRules): number {
  const freeTax = rules.incomeTax.solidarityFreeTax

  if (incomeTax <= freeTax) {
    return 0
  }

  const regular = incomeTax * 0.055
  const transition = (incomeTax - freeTax) * 0.119

  return Math.max(0, Math.min(regular, transition))
}

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
