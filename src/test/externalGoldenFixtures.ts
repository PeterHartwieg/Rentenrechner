/**
 * External validation fixtures.
 *
 * These values are intentionally written as captured constants instead of being
 * derived from engine helpers. Each case should point at an official source or
 * calculator run so regressions fail against an outside reference, not against
 * another copy of our own implementation.
 */

export interface ValidationSource {
  id: string
  label: string
  kind: 'official-calculator' | 'official-table' | 'statutory-formula'
  url: string
  capturedAt: string
  notes: string
}

export const validationSources = [
  {
    id: 'bmf-est-2026-tariff',
    label: 'BMF LStH 2026 §32a Einkommensteuertarif',
    kind: 'statutory-formula',
    url: 'https://esth.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/IV-Tarif-31-34b/Paragraf-32a/inhalt.html',
    capturedAt: '2026-05-02',
    notes: 'Official 2026 tariff brackets and formula constants for single assessment.',
  },
  {
    id: 'bmf-lohnsteuerrechner-2026',
    label: 'BMF Lohnsteuerrechner 2026',
    kind: 'official-calculator',
    url: 'https://www.bmf-steuerrechner.de/bl/bl2026/eingabeformbl2026.xhtml',
    capturedAt: '2026-05-02',
    notes: 'Steuerklasse I, no church tax, public health insurance with 2.9% Zusatzbeitrag.',
  },
  {
    id: 'bmas-sv-rechengroessen-2026',
    label: 'BMAS Sozialversicherungsrechengroessen-Verordnung 2026',
    kind: 'official-table',
    url: 'https://www.bmas.de/DE/Service/Gesetze-und-Gesetzesvorhaben/sozialversicherungs-rechengroessenverordnung-2026.html',
    capturedAt: '2026-05-02',
    notes: 'Official 2026 BBG, Bezugsgröße, and preliminary Durchschnittsentgelt table.',
  },
  {
    id: 'bmf-vorabpauschale-basiszins-2026',
    label: 'BMF Basiszins zur Vorabpauschale 2026',
    kind: 'official-table',
    url: 'https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.html',
    capturedAt: '2026-05-02',
    notes: 'Basiszins zum 2. Januar 2026 for InvStG §18 Vorabpauschale.',
  },
  {
    id: 'estg-riester-allowance-rules',
    label: 'EStG Riester allowance and minimum-contribution rules',
    kind: 'statutory-formula',
    url: 'https://www.gesetze-im-internet.de/estg/__86.html',
    capturedAt: '2026-05-02',
    notes: 'Statutory Riester Mindesteigenbeitrag rule; allowance amounts are in EStG sections 84 and 85.',
  },
  {
    id: 'drv-zfa-riester-rechner',
    label: 'DRV/ZfA Riester-Rechner',
    kind: 'official-calculator',
    url: 'https://riester.deutsche-rentenversicherung.de/DE/Riester-Rechner/riester-rechner_themen-einstieg',
    capturedAt: '2026-05-02',
    notes: 'Use for allowance and Mindesteigenbeitrag cross-check scenarios.',
  },
] satisfies ValidationSource[]

export const incomeTax2026GoldenCases = [
  {
    id: 'basic-allowance-ceiling',
    sourceId: 'bmf-est-2026-tariff',
    taxableIncome: 12_348,
    expectedIncomeTax: 0,
    toleranceEUR: 0,
  },
  {
    id: 'first-progression-zone',
    sourceId: 'bmf-est-2026-tariff',
    taxableIncome: 15_000,
    expectedIncomeTax: 435,
    toleranceEUR: 0,
  },
  {
    id: 'second-progression-zone',
    sourceId: 'bmf-est-2026-tariff',
    taxableIncome: 59_191,
    expectedIncomeTax: 13_922,
    toleranceEUR: 0,
  },
  {
    id: 'proportional-42-zone',
    sourceId: 'bmf-est-2026-tariff',
    taxableIncome: 75_000,
    expectedIncomeTax: 20_364,
    toleranceEUR: 0,
  },
  {
    id: 'top-tax-threshold',
    sourceId: 'bmf-est-2026-tariff',
    taxableIncome: 277_826,
    expectedIncomeTax: 105_551,
    toleranceEUR: 0,
  },
] as const

export const payroll2026GoldenCases = [
  {
    id: 'stk1-gkv-50k',
    sourceId: 'bmf-lohnsteuerrechner-2026',
    grossSalaryYear: 50_000,
    expectedTaxableIncome: 38_659,
    expectedIncomeTax: 6_788,
    expectedSolidarityTax: 0,
    toleranceEUR: 1,
  },
  {
    id: 'stk1-gkv-75k',
    sourceId: 'bmf-lohnsteuerrechner-2026',
    grossSalaryYear: 75_000,
    expectedTaxableIncome: 59_191,
    expectedIncomeTax: 13_922,
    expectedSolidarityTax: 0,
    toleranceEUR: 1,
  },
  {
    id: 'stk1-gkv-100k',
    sourceId: 'bmf-lohnsteuerrechner-2026',
    grossSalaryYear: 100_000,
    expectedTaxableIncome: 81_866,
    expectedIncomeTax: 23_248,
    expectedSolidarityTax: 345,
    toleranceEUR: 1,
  },
] as const

export const socialSecurity2026GoldenValues = [
  {
    id: 'rv-av-bbg-annual',
    sourceId: 'bmas-sv-rechengroessen-2026',
    field: 'pensionCapYear',
    expected: 101_400,
  },
  {
    id: 'kv-pv-bbg-annual',
    sourceId: 'bmas-sv-rechengroessen-2026',
    field: 'healthCareCapYear',
    expected: 69_750,
  },
  {
    id: 'kv-pv-bbg-monthly',
    sourceId: 'bmas-sv-rechengroessen-2026',
    field: 'healthAndCareCapMonth',
    expected: 5_812.50,
  },
  {
    id: 'bezugsgröße-monthly',
    sourceId: 'bmas-sv-rechengroessen-2026',
    field: 'bezugsgroesseMonthly',
    expected: 3_955,
  },
  {
    id: 'durchschnittsentgelt-2026',
    sourceId: 'bmas-sv-rechengroessen-2026',
    field: 'durchschnittsentgelt',
    expected: 51_944,
  },
] as const

export const capitalGains2026GoldenValues = [
  {
    id: 'vorabpauschale-basiszins',
    sourceId: 'bmf-vorabpauschale-basiszins-2026',
    field: 'basiszins',
    expected: 0.032,
  },
] as const

export const riester2026GoldenCases = [
  {
    id: 'single-no-children-full-allowance',
    sourceId: 'estg-riester-allowance-rules',
    grossSalaryYear: 40_000,
    monthlyOwnContribution: 118.75,
    childBirthYears: [],
    expectedMinEigenbeitragAnnual: 1_425,
    expectedTotalAllowanceAnnual: 175,
    expectedMeetsMinContribution: true,
    toleranceEUR: 0.01,
  },
  {
    id: 'two-post-2007-children-full-allowance',
    sourceId: 'estg-riester-allowance-rules',
    grossSalaryYear: 40_000,
    monthlyOwnContribution: 68.75,
    childBirthYears: [2012, 2015],
    expectedMinEigenbeitragAnnual: 825,
    expectedTotalAllowanceAnnual: 775,
    expectedMeetsMinContribution: true,
    toleranceEUR: 0.01,
  },
] as const
