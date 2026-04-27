import type { GermanRules } from '../domain/types'

export const de2026Rules: GermanRules = {
  year: 2026,
  employeeAllowance: 1_230,
  specialExpensesAllowance: 36,
  incomeTax: {
    basicAllowance: 12_348,
    firstProgressionEnd: 17_799,
    secondProgressionEnd: 69_878,
    topTaxStart: 277_826,
    solidarityFreeTax: 20_350,
  },
  socialSecurity: {
    pensionCapYear: 101_400,
    healthCareCapYear: 69_750,
    pensionEmployeeRate: 0.093,
    pensionEmployerRate: 0.093,
    unemploymentEmployeeRate: 0.013,
    unemploymentEmployerRate: 0.013,
    healthGeneralRate: 0.146,
    careEmployeeBaseRate: 0.018,
    careEmployeeChildlessRate: 0.024,
    careEmployerRate: 0.018,
    careRetirementChildlessRate: 0.042,
    // SGB V section 226: 1/20 of the 2026 monthly Bezugsgröße West (3,955 EUR).
    kvFreibetragVersorgungMonthly: 197.75,
  },
  bav: {
    taxFreePctOfPensionCap: 0.08,
    socialSecurityFreePctOfPensionCap: 0.04,
    statutoryEmployerSubsidyPct: 0.15,
  },
  capitalGains: {
    taxRate: 0.25,
    solidarityRate: 0.055,
    saverAllowance: 1_000,
  },
}
