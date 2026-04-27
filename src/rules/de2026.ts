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
    // ermäßigter Beitragssatz (§243 SGB V, without Krankengeld entitlement): used in §39b EStG Vorsorgepauschale
    healthReducedRate: 0.14,
    careEmployeeBaseRate: 0.018,
    careEmployeeChildlessRate: 0.024,
    careEmployerRate: 0.018,
    careRetirementChildlessRate: 0.042,
    // §226(2) SGB V KV-Freibetrag (= §57(1) SGB XI PV-Freigrenze): 1/20 of monthly Bezugsgröße West 2026 (3,955 EUR)
    kvFreibetragVersorgungMonthly: 197.75,
    // Bezugsgröße West 2026 nach §18 Abs. 1 SGB IV
    bezugsgroesseMonthly: 3_955,
    // SGB VI Anlage 1: vorläufiges Durchschnittsentgelt 2026 — denominator for Entgeltpunkte
    durchschnittsentgelt: 45_358,
    // Aktueller Rentenwert West ab 1.7.2025; 2026 update usually effective 1.7.2026
    aktuellerRentenwert: 39.32,
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
    // BMF Basiszins nach §203 BewG für Vorabpauschale 2026: 3.20 % (BMF-Schreiben 2026-01-13)
    basiszins: 0.032,
  },
}
