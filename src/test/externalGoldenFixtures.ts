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
    id: 'bmf-einkommensteuerrechner-2026',
    label: 'BMF Einkommensteuerrechner 2026',
    kind: 'official-calculator',
    url: 'https://www.bmf-steuerrechner.de/ekst/eingabeformekst.xhtml',
    capturedAt: '2026-05-02',
    notes: 'Grundtarif (alleinstehend), zvE only. Reads back Einkommensteuer and Solidaritätszuschlag separately.',
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
    id: 'bmas-rentenwert-2026',
    label: 'BMAS Rentenwertbestimmungsverordnung 2026',
    kind: 'official-table',
    url: 'https://www.bmas.de/DE/Service/Gesetze-und-Gesetzesvorhaben/rentenwertbestimmungsverordnung-2026.html',
    capturedAt: '2026-05-02',
    notes: 'Current pension value increases to 42.52 EUR per Entgeltpunkt from 2026-07-01.',
  },
  {
    id: 'drv-rentenschaetzer-current-2026',
    label: 'DRV Rentenschätzer current 2026 page',
    kind: 'official-calculator',
    url: 'https://www.deutsche-rentenversicherung.de/DRV/DE/Online-Services/Online-Rechner/Rentenschaetzer/rentenschaetzer_node.html',
    capturedAt: '2026-05-02',
    notes: 'Current DRV page still shows 40.79 EUR per Entgeltpunkt before the 2026-07-01 Rentenwert step.',
  },
  {
    id: 'sgb-vi-rentenformel',
    label: 'SGB VI pension formula',
    kind: 'statutory-formula',
    url: 'https://www.gesetze-im-internet.de/sgb_6/__64.html',
    capturedAt: '2026-05-02',
    notes: 'Monthly pension formula: personal Entgeltpunkte times Rentenartfaktor times aktueller Rentenwert.',
  },
  {
    id: 'estg-retirement-cohort-tables',
    label: 'EStG retirement cohort tables',
    kind: 'statutory-formula',
    url: 'https://www.gesetze-im-internet.de/estg/__22.html',
    capturedAt: '2026-05-02',
    notes: 'Besteuerungsanteil table in §22 EStG, Versorgungsfreibetrag table in §19 EStG, plus §9a/§10c Pauschbeträge for retirement-tax golden cases.',
  },
  {
    id: 'bayern-alterseinkuenfte-rechner-2026',
    label: 'Bayerisches LfSt Alterseinkünfte-Rechner 2026',
    kind: 'official-calculator',
    url: 'https://www.steuerberechnung.bayern.de/Alterseinkuenfte-Rechner/2026/aekr_formular.asp?VLG=1',
    capturedAt: '2026-05-02',
    notes: 'Alleinstehende, no Kinder, no church tax. End-to-end retirement tax oracle covering Besteuerungsanteil §22, Versorgungsfreibetrag §19, Ertragsanteil, and §9a/§10c Pauschbeträge.',
  },
  {
    id: 'estg-bav-contribution-limits',
    label: 'EStG and SvEV bAV contribution limits',
    kind: 'statutory-formula',
    url: 'https://www.gesetze-im-internet.de/estg/__3.html',
    capturedAt: '2026-05-02',
    notes: '§3 Nr. 63 EStG tax-free bAV limit is 8% of RV BBG; §1 SvEV social-security-free limit is 4% of RV BBG.',
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
    notes: 'Calculator endpoint captured via SiteGlobals/Forms/Riesterrechner/Riesterrechner_Form data-qa result fields.',
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

/**
 * Captured directly from the BMF Einkommensteuer-Rechner online form
 * (Grundtarif, alleinstehend, Berechnungsjahr 2026). Each row was entered
 * by hand on 2026-05-02 and the "Einkommensteuer" / "Solidaritätszuschlag"
 * lines from the result page are recorded verbatim.
 *
 * This is an independent oracle for §32a EStG and §4 SolzG: BMF runs its
 * own implementation of the law-text formula on its servers, so a regression
 * here flags a coefficient or rounding drift in our engine versus BMF.
 */
export const bmfEinkommensteuerRechner2026GoldenCases = [
  {
    id: 'ekst-rechner-grundfreibetrag-boundary',
    sourceId: 'bmf-einkommensteuerrechner-2026',
    taxableIncome: 12_348,
    expectedIncomeTax: 0,
    expectedSolidarityTax: 0,
    toleranceEUR: 0.01,
  },
  {
    id: 'ekst-rechner-zone-b-mid',
    sourceId: 'bmf-einkommensteuerrechner-2026',
    taxableIncome: 15_000,
    expectedIncomeTax: 435,
    expectedSolidarityTax: 0,
    toleranceEUR: 0.01,
  },
  {
    id: 'ekst-rechner-zone-b-c-boundary',
    sourceId: 'bmf-einkommensteuerrechner-2026',
    taxableIncome: 17_799,
    expectedIncomeTax: 1_034,
    expectedSolidarityTax: 0,
    toleranceEUR: 0.01,
  },
  {
    id: 'ekst-rechner-zone-c-lower',
    sourceId: 'bmf-einkommensteuerrechner-2026',
    taxableIncome: 30_000,
    expectedIncomeTax: 4_217,
    expectedSolidarityTax: 0,
    toleranceEUR: 0.01,
  },
  {
    id: 'ekst-rechner-zone-c-upper',
    sourceId: 'bmf-einkommensteuerrechner-2026',
    taxableIncome: 50_000,
    expectedIncomeTax: 10_548,
    expectedSolidarityTax: 0,
    toleranceEUR: 0.01,
  },
  {
    id: 'ekst-rechner-zone-c-d-boundary',
    sourceId: 'bmf-einkommensteuerrechner-2026',
    taxableIncome: 69_878,
    expectedIncomeTax: 18_213,
    expectedSolidarityTax: 0,
    toleranceEUR: 0.01,
  },
  {
    id: 'ekst-rechner-zone-d-mid',
    sourceId: 'bmf-einkommensteuerrechner-2026',
    taxableIncome: 150_000,
    expectedIncomeTax: 51_864,
    expectedSolidarityTax: 2_852.52,
    toleranceEUR: 0.01,
  },
  {
    id: 'ekst-rechner-reichensteuer',
    sourceId: 'bmf-einkommensteuerrechner-2026',
    taxableIncome: 300_000,
    expectedIncomeTax: 115_529,
    expectedSolidarityTax: 6_354.09,
    toleranceEUR: 0.01,
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
  {
    id: 'aktueller-rentenwert-post-july-2026',
    sourceId: 'bmas-rentenwert-2026',
    field: 'aktuellerRentenwert',
    expected: 42.52,
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

/**
 * Fixtures for the public DRV/ZfA Riester-Rechner.
 *
 * Endpoint: GET https://riester.deutsche-rentenversicherung.de/SiteGlobals/Forms/Riesterrechner/Riesterrechner_Form
 * Result fields are exposed via `data-qa="copaymentMonthly|copaymentYearly|
 * fundamentalBonus|childrenBonus|investmentAmount"` in the response HTML.
 *
 * `eligibility` describes how the calculator's familienstand × sozialversicherungsStatus
 * inputs map to the engine's `RiesterEligibility` flags:
 *   - `directlyEligible`     → user is RENTENVERSICHERUNGSPFLICHTIG (or equivalent)
 *   - `indirectSpouseEligible` → user is "WEITERE" but partner is directly eligible (mittelbar)
 * `careerStarterBonusUsed = false` means the BEB is paid in the test year (the
 * calculator silently includes the 200 EUR BEB into `investmentAmount` when the
 * birth year qualifies, without exposing a separate data-qa).
 *
 * For mittelbare savers the calculator emits `childrenBonus` when children are
 * entered on this contract — the engine matches that behavior, treating the
 * attribution as transferred per §85 Abs. 2 Satz 2 EStG.
 */
export const zfaRiesterCalculatorGoldenCases = [
  {
    id: 'zfa-single-no-children-40k',
    sourceId: 'drv-zfa-riester-rechner',
    calculatorInput: {
      geburtsjahr: 1986,
      kinderVor2008: 0,
      kinderNach2008: 0,
      familienstand: 'LEDIG',
      sozialversicherungsStatus: 'RENTENVERSICHERUNGSPFLICHTIG',
      bruttoeinkommen: 40_000,
    },
    profile: {
      grossSalaryYear: 40_000,
      childBirthYears: [],
    },
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      careerStarterBonusUsed: true,
      ageAtContractStart: 40,
    },
    expected: {
      copaymentMonthly: 118.75,
      copaymentYearly: 1_425,
      fundamentalBonus: 175,
      childrenBonus: 0,
      investmentAmount: 1_600,
    },
    toleranceEUR: 0.01,
  },
  {
    id: 'zfa-single-two-post-2007-children-40k',
    sourceId: 'drv-zfa-riester-rechner',
    calculatorInput: {
      geburtsjahr: 1986,
      kinderVor2008: 0,
      kinderNach2008: 2,
      familienstand: 'LEDIG',
      sozialversicherungsStatus: 'RENTENVERSICHERUNGSPFLICHTIG',
      bruttoeinkommen: 40_000,
    },
    profile: {
      grossSalaryYear: 40_000,
      childBirthYears: [2012, 2015],
    },
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      careerStarterBonusUsed: true,
      ageAtContractStart: 40,
    },
    expected: {
      copaymentMonthly: 68.75,
      copaymentYearly: 825,
      fundamentalBonus: 175,
      childrenBonus: 600,
      investmentAmount: 1_600,
    },
    toleranceEUR: 0.01,
  },
  {
    // Captured 2026-05-02 from the live ZfA endpoint.
    id: 'zfa-married-direct-no-children-50k',
    sourceId: 'drv-zfa-riester-rechner',
    calculatorInput: {
      geburtsjahr: 1980,
      kinderVor2008: 0,
      kinderNach2008: 0,
      familienstand: 'VERHEIRATET',
      sozialversicherungsStatus: 'RENTENVERSICHERUNGSPFLICHTIG',
      sozialversicherungsStatusPartner: 'RENTENVERSICHERUNGSPFLICHTIG',
      bruttoeinkommen: 50_000,
    },
    profile: {
      grossSalaryYear: 50_000,
      childBirthYears: [],
    },
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      careerStarterBonusUsed: true,
      ageAtContractStart: 46,
    },
    expected: {
      copaymentMonthly: 152.08,
      copaymentYearly: 1_825,
      fundamentalBonus: 175,
      childrenBonus: 0,
      investmentAmount: 2_000,
    },
    toleranceEUR: 0.01,
  },
  {
    // Mittelbar Zulageberechtigung (§79 Satz 2 EStG): user is "WEITERE" with no
    // own GRV income; partner is RV-pflichtig. Sockelbetrag 60 EUR/Jahr unlocks
    // full Grundzulage 175 EUR.
    id: 'zfa-married-indirect-no-income',
    sourceId: 'drv-zfa-riester-rechner',
    calculatorInput: {
      geburtsjahr: 1985,
      kinderVor2008: 0,
      kinderNach2008: 0,
      familienstand: 'VERHEIRATET',
      sozialversicherungsStatus: 'WEITERE',
      sozialversicherungsStatusPartner: 'RENTENVERSICHERUNGSPFLICHTIG',
      bruttoeinkommen: 0,
    },
    profile: {
      grossSalaryYear: 0,
      childBirthYears: [],
    },
    eligibility: {
      directlyEligible: false,
      indirectSpouseEligible: true,
      careerStarterBonusUsed: true,
      ageAtContractStart: 41,
    },
    expected: {
      copaymentMonthly: 5,
      copaymentYearly: 60,
      fundamentalBonus: 175,
      childrenBonus: 0,
      investmentAmount: 235,
    },
    toleranceEUR: 0.01,
  },
  {
    // Mittelbar with child attributed to this contract (§85 Abs. 2 Satz 2): the
    // ZfA calc grants 300 EUR Kinderzulage when kids are entered here. Engine
    // mirrors the attribution-transferred assumption.
    id: 'zfa-married-indirect-one-child-2010',
    sourceId: 'drv-zfa-riester-rechner',
    calculatorInput: {
      geburtsjahr: 1985,
      kinderVor2008: 0,
      kinderNach2008: 1,
      familienstand: 'VERHEIRATET',
      sozialversicherungsStatus: 'WEITERE',
      sozialversicherungsStatusPartner: 'RENTENVERSICHERUNGSPFLICHTIG',
      bruttoeinkommen: 0,
    },
    profile: {
      grossSalaryYear: 0,
      childBirthYears: [2010],
    },
    eligibility: {
      directlyEligible: false,
      indirectSpouseEligible: true,
      careerStarterBonusUsed: true,
      ageAtContractStart: 41,
    },
    expected: {
      copaymentMonthly: 5,
      copaymentYearly: 60,
      fundamentalBonus: 175,
      childrenBonus: 300,
      investmentAmount: 535,
    },
    toleranceEUR: 0.01,
  },
  {
    // Pre-2008 + post-2007 child mix: 185 + 300 = 485 EUR Kinderzulage total.
    id: 'zfa-single-pre2008-and-post2007-child-40k',
    sourceId: 'drv-zfa-riester-rechner',
    calculatorInput: {
      geburtsjahr: 1980,
      kinderVor2008: 1,
      kinderNach2008: 1,
      familienstand: 'LEDIG',
      sozialversicherungsStatus: 'RENTENVERSICHERUNGSPFLICHTIG',
      bruttoeinkommen: 40_000,
    },
    profile: {
      grossSalaryYear: 40_000,
      // One pre-2008 child (185 EUR) + one post-2007 child (300 EUR) = 485 EUR.
      childBirthYears: [2005, 2010],
    },
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      careerStarterBonusUsed: true,
      ageAtContractStart: 46,
    },
    expected: {
      copaymentMonthly: 78.33,
      copaymentYearly: 940,
      fundamentalBonus: 175,
      childrenBonus: 485,
      investmentAmount: 1_600,
    },
    toleranceEUR: 0.01,
  },
  {
    // Career starter (§84 Satz 2 EStG): age ≤ 24 at first contribution year.
    // Calculator silently bundles the 200 EUR BEB into investmentAmount without
    // exposing a separate data-qa. Engine returns it via careerStarterBonusAnnual.
    id: 'zfa-career-starter-age-22-30k',
    sourceId: 'drv-zfa-riester-rechner',
    calculatorInput: {
      geburtsjahr: 2004,
      kinderVor2008: 0,
      kinderNach2008: 0,
      familienstand: 'LEDIG',
      sozialversicherungsStatus: 'RENTENVERSICHERUNGSPFLICHTIG',
      bruttoeinkommen: 30_000,
    },
    profile: {
      grossSalaryYear: 30_000,
      childBirthYears: [],
    },
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      // Bonus paid in the test year → not yet used.
      careerStarterBonusUsed: false,
      ageAtContractStart: 22,
    },
    expected: {
      copaymentMonthly: 68.75,
      copaymentYearly: 825,
      fundamentalBonus: 175,
      // 200 EUR BEB (oracle bundles into investmentAmount; engine returns via the
      // sum childAllowanceAnnual + careerStarterBonusAnnual = 0 + 200).
      childrenBonus: 200,
      investmentAmount: 1_200,
    },
    toleranceEUR: 0.01,
  },
] as const

export const besteuerungsanteilGoldenValues = [
  {
    id: 'besteuerungsanteil-2005-anchor',
    sourceId: 'estg-retirement-cohort-tables',
    retirementYear: 2005,
    expected: 0.50,
  },
  {
    id: 'besteuerungsanteil-2026',
    sourceId: 'estg-retirement-cohort-tables',
    retirementYear: 2026,
    expected: 0.84,
  },
  {
    id: 'besteuerungsanteil-2058-cap',
    sourceId: 'estg-retirement-cohort-tables',
    retirementYear: 2058,
    expected: 1.00,
  },
] as const

export const versorgungsfreibetragGoldenValues = [
  {
    id: 'versorgungsfreibetrag-2026',
    sourceId: 'estg-retirement-cohort-tables',
    retirementYear: 2026,
    expectedProzent: 0.128,
    expectedHoechstbetrag: 960,
    expectedZuschlag: 288,
  },
  {
    id: 'versorgungsfreibetrag-2040',
    sourceId: 'estg-retirement-cohort-tables',
    retirementYear: 2040,
    expectedProzent: 0.072,
    expectedHoechstbetrag: 540,
    expectedZuschlag: 162,
  },
  {
    id: 'versorgungsfreibetrag-2058',
    sourceId: 'estg-retirement-cohort-tables',
    retirementYear: 2058,
    expectedProzent: 0,
    expectedHoechstbetrag: 0,
    expectedZuschlag: 0,
  },
] as const

export const statutoryPensionGoldenCases = [
  {
    id: 'standard-pension-45-ep-post-july-2026',
    sourceId: 'sgb-vi-rentenformel',
    rulesAktuellerRentenwert: 42.52,
    age: 40,
    retirementAge: 67,
    grossSalaryYear: 51_944,
    currentEntgeltpunkte: 18,
    expectedProjectedEntgeltpunkte: 45,
    expectedGrossMonthlyPension: 1_913.40,
    toleranceEUR: 0.01,
    notes: '27 future years at exactly 2026 Durchschnittsentgelt add 27 EP; 45 EP × 42.52 EUR.',
  },
  {
    id: 'bbg-capped-ep-accrual',
    sourceId: 'sgb-vi-rentenformel',
    rulesAktuellerRentenwert: 42.52,
    age: 40,
    retirementAge: 67,
    grossSalaryYear: 200_000,
    currentEntgeltpunkte: 0,
    expectedProjectedEntgeltpunkte: 52.70676112736793,
    expectedGrossMonthlyPension: 2_241.09,
    toleranceEUR: 0.01,
    notes: '27 future years capped at RV/AV BBG 101,400 EUR divided by Durchschnittsentgelt 51,944 EUR.',
  },
  {
    id: 'drv-current-page-standard-rente-45-ep',
    sourceId: 'drv-rentenschaetzer-current-2026',
    rulesAktuellerRentenwert: 40.79,
    age: 67,
    retirementAge: 67,
    grossSalaryYear: 0,
    currentEntgeltpunkte: 45,
    expectedProjectedEntgeltpunkte: 45,
    expectedGrossMonthlyPension: 1_835.55,
    toleranceEUR: 0.01,
    notes: 'Temporary DRV-compatible fixture: 45 EP × 40.79 EUR current page value. Does not change app defaults.',
  },
] as const

export const bavContributionLimitGoldenValues = [
  {
    id: 'bav-tax-free-limit-annual',
    sourceId: 'estg-bav-contribution-limits',
    kind: 'taxFreeAnnual',
    expected: 8_112,
  },
  {
    id: 'bav-tax-free-limit-monthly',
    sourceId: 'estg-bav-contribution-limits',
    kind: 'taxFreeMonthly',
    expected: 676,
  },
  {
    id: 'bav-sv-free-limit-annual',
    sourceId: 'estg-bav-contribution-limits',
    kind: 'svFreeAnnual',
    expected: 4_056,
  },
  {
    id: 'bav-sv-free-limit-monthly',
    sourceId: 'estg-bav-contribution-limits',
    kind: 'svFreeMonthly',
    expected: 338,
  },
] as const

export const retirementTaxGoldenCases = [
  {
    id: 'grv-only-2026',
    sourceId: 'estg-retirement-cohort-tables',
    components: {
      statutoryPensionAnnual: 24_000,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: 0,
      retirementYear: 2026,
    },
    expected: {
      statutoryPensionTaxable: 20_160,
      bavPensionTaxable: 0,
      privateInsuranceTaxable: 0,
      zuVersteuerndesEinkommen: 20_022,
      einkommensteuer: 1_576,
      totalTaxAnnual: 1_576,
    },
    toleranceEUR: 0.01,
  },
  {
    id: 'bav-ongoing-2026',
    sourceId: 'estg-retirement-cohort-tables',
    components: {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 24_000,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: 0,
      retirementYear: 2026,
    },
    expected: {
      statutoryPensionTaxable: 0,
      bavPensionTaxable: 22_752,
      privateInsuranceTaxable: 0,
      zuVersteuerndesEinkommen: 22_614,
      einkommensteuer: 2_229,
      totalTaxAnnual: 2_229,
    },
    toleranceEUR: 0.01,
  },
  {
    id: 'combined-grv-bav-halbeinkuenfte-2030',
    sourceId: 'estg-retirement-cohort-tables',
    components: {
      statutoryPensionAnnual: 18_000,
      bavPensionAnnual: 24_000,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 6_000,
      privateInsuranceTaxMode: 'halbeinkuenfte',
      otherTaxableAnnual: 0,
      retirementYear: 2030,
    },
    expected: {
      statutoryPensionTaxable: 15_480,
      bavPensionTaxable: 22_908,
      privateInsuranceTaxable: 3_000,
      zuVersteuerndesEinkommen: 41_148,
      einkommensteuer: 7_575,
      totalTaxAnnual: 7_575,
    },
    toleranceEUR: 0.01,
  },
] as const

/**
 * Captured by hand from the Bayerisches LfSt Alterseinkünfte-Rechner 2026
 * (Alleinstehende, VLG=1, Berechnungsjahr 2026). Each case exercises the
 * end-to-end retirement-tax pipeline: cohort allowances (§22 Besteuerungsanteil,
 * §19 Versorgungsfreibetrag/Zuschlag, Ertragsanteil), §9a Werbungskosten-
 * Pauschbeträge, and §10c Sonderausgaben-Pauschbetrag, before §32a EStG.
 *
 * Versorgungsbezug entries use Höhe für den ersten vollen Kalendermonat =
 * Jahresbetrag / 12, Sonderzahlungen = 0, so that the §19 Abs. 2 Satz 4 EStG
 * Bemessungsgrundlage matches the Jahresbruttobetrag exactly.
 */
export const bayernAlterseinkuenfte2026GoldenCases = [
  {
    id: 'bayern-grv-only-2026',
    sourceId: 'bayern-alterseinkuenfte-rechner-2026',
    components: {
      statutoryPensionAnnual: 24_000,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: 0,
      retirementYear: 2026,
    },
    expected: {
      zuVersteuerndesEinkommen: 20_022,
      einkommensteuer: 1_576,
    },
    toleranceEUR: 0.01,
  },
  {
    id: 'bayern-bav-versorgungsbezug-only-2026',
    sourceId: 'bayern-alterseinkuenfte-rechner-2026',
    components: {
      statutoryPensionAnnual: 0,
      bavPensionAnnual: 24_000,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: 0,
      retirementYear: 2026,
    },
    expected: {
      zuVersteuerndesEinkommen: 22_614,
      einkommensteuer: 2_229,
    },
    toleranceEUR: 0.01,
  },
  {
    id: 'bayern-grv-plus-bav-versorgungsbezug-2026',
    sourceId: 'bayern-alterseinkuenfte-rechner-2026',
    components: {
      statutoryPensionAnnual: 18_000,
      bavPensionAnnual: 24_000,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 0,
      privateInsuranceTaxMode: 'abgeltungsteuer',
      otherTaxableAnnual: 0,
      retirementYear: 2026,
    },
    expected: {
      zuVersteuerndesEinkommen: 37_632,
      einkommensteuer: 6_469,
    },
    toleranceEUR: 0.01,
  },
  {
    id: 'bayern-grv-plus-private-leibrente-ertragsanteil-2026',
    sourceId: 'bayern-alterseinkuenfte-rechner-2026',
    components: {
      // 12,000 EUR/year private Leibrente starting at completed age 67
      // → §22 Nr. 1 Satz 3 a aa EStG Ertragsanteil 17 % → 2,040 EUR taxable.
      statutoryPensionAnnual: 18_000,
      bavPensionAnnual: 0,
      bavIsLumpSum: false,
      privateInsuranceTaxableAnnual: 2_040,
      privateInsuranceTaxMode: 'ertragsanteil',
      otherTaxableAnnual: 0,
      retirementYear: 2026,
    },
    expected: {
      zuVersteuerndesEinkommen: 17_022,
      einkommensteuer: 854,
    },
    toleranceEUR: 0.01,
  },
] as const

export const etfVorabpauschaleGoldenCases = [
  {
    id: 'monthly-purchases-prorated-acquisition-base',
    sourceId: 'bmf-vorabpauschale-basiszins-2026',
    months: 12,
    initialCapital: 0,
    monthlyContribution: 1_000,
    annualReturn: 0.10,
    partialExemption: 0,
    expectedCumulativeVorabpauschale: 145.60,
    toleranceEUR: 0.01,
    notes: '12 monthly purchases: 1,000 × (12+...+1)/12 × 3.20% × 70%.',
  },
  {
    id: 'opening-balance-basisertrag',
    sourceId: 'bmf-vorabpauschale-basiszins-2026',
    months: 12,
    initialCapital: 100_000,
    monthlyContribution: 0,
    annualReturn: 0.10,
    partialExemption: 0.30,
    expectedCumulativeVorabpauschale: 2_240,
    toleranceEUR: 0.01,
    notes: 'Opening balance: 100,000 × 3.20% × 70%; partial exemption affects tax, not gross Vorabpauschale accrual.',
  },
  {
    id: 'opening-balance-gain-cap',
    sourceId: 'bmf-vorabpauschale-basiszins-2026',
    months: 12,
    initialCapital: 100_000,
    monthlyContribution: 0,
    annualReturn: 0.01,
    partialExemption: 0,
    expectedCumulativeVorabpauschale: 1_000,
    toleranceEUR: 0.01,
    notes: 'Basisertrag would be 2,240 EUR, but InvStG §18 caps VP at the actual annual gain of 1,000 EUR.',
  },
] as const

export const etfExitTaxGoldenCases = [
  {
    id: 'aktienfonds-exit-without-vorabpauschale',
    sourceId: 'bmf-vorabpauschale-basiszins-2026',
    capital: 200_000,
    totalContributions: 100_000,
    cumulativeVorabpauschale: 0,
    partialExemption: 0.30,
    expectedTaxableExitGainBeforeExemption: 100_000,
    expectedTaxDue: 18_198.75,
    expectedAfterTaxCapital: 181_801.25,
    toleranceEUR: 0.01,
  },
  {
    id: 'aktienfonds-exit-after-vorabpauschale-cost-basis-carryover',
    sourceId: 'bmf-vorabpauschale-basiszins-2026',
    capital: 200_000,
    totalContributions: 100_000,
    cumulativeVorabpauschale: 10_000,
    partialExemption: 0.30,
    expectedTaxableExitGainBeforeExemption: 90_000,
    expectedTaxDue: 16_352.50,
    expectedAfterTaxCapital: 183_647.50,
    toleranceEUR: 0.01,
  },
] as const

export const bavFundingBoundaryGoldenCases = [
  {
    id: 'employee-at-4pct-bbg-with-statutory-subsidy',
    sourceId: 'estg-bav-contribution-limits',
    monthlyGrossConversion: 338,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
    expectedAnnualGrossConversion: 4_056,
    expectedAnnualEmployerContribution: 388.7300091569323,
    expectedTotalBavContributionAnnual: 4_444.730009156932,
    expectedTaxFreePortionAnnual: 4_444.730009156932,
    expectedSvFreePortionAnnual: 4_056,
    expectedTaxableOverflowAnnual: 0,
    expectedSvLiableOverflowAnnual: 388.7300091569323,
    toleranceEUR: 0.01,
  },
  {
    id: 'employee-at-8pct-bbg-with-statutory-subsidy',
    sourceId: 'estg-bav-contribution-limits',
    monthlyGrossConversion: 676,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
    expectedAnnualGrossConversion: 8_112,
    expectedAnnualEmployerContribution: 388.7300091569323,
    expectedTotalBavContributionAnnual: 8_500.730009156932,
    expectedTaxFreePortionAnnual: 8_112,
    expectedSvFreePortionAnnual: 4_056,
    expectedTaxableOverflowAnnual: 388.7300091569323,
    expectedSvLiableOverflowAnnual: 4_444.730009156932,
    toleranceEUR: 0.01,
  },
  {
    id: 'high-employer-match-crosses-sv-limit',
    sourceId: 'estg-bav-contribution-limits',
    monthlyGrossConversion: 300,
    contractualMatchPercent: 1,
    contractualFixedMonthly: 0,
    expectedAnnualGrossConversion: 3_600,
    expectedAnnualEmployerContribution: 3_643.7040206552592,
    expectedTotalBavContributionAnnual: 7_243.704020655259,
    expectedTaxFreePortionAnnual: 7_243.704020655259,
    expectedSvFreePortionAnnual: 4_056,
    expectedTaxableOverflowAnnual: 0,
    expectedSvLiableOverflowAnnual: 3_187.7040206552592,
    toleranceEUR: 0.01,
  },
  {
    id: 'employee-above-8pct-bbg-with-statutory-subsidy',
    sourceId: 'estg-bav-contribution-limits',
    monthlyGrossConversion: 800,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
    expectedAnnualGrossConversion: 9_600,
    expectedAnnualEmployerContribution: 388.7300091569323,
    expectedTotalBavContributionAnnual: 9_988.730009156932,
    expectedTaxFreePortionAnnual: 8_112,
    expectedSvFreePortionAnnual: 4_056,
    expectedTaxableOverflowAnnual: 1_876.7300091569323,
    expectedSvLiableOverflowAnnual: 5_932.730009156932,
    toleranceEUR: 0.01,
  },
] as const
