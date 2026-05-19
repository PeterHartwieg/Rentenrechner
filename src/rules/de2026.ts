import type { GermanRules } from '../domain'

// Cohort helpers (besteuerungsanteilGrv, versorgungsfreibetrag) and
// Pauschbetrag constants live in `legalConstants.ts` — they are cross-year
// by nature (parametrised tables / values that change only on law amendment),
// so pinning them to the year-named file would make the active-rule swap-point
// (`src/rules/index.ts`) drift silently when the year rolls forward.

export const de2026Rules: GermanRules = {
  year: 2026,
  employeeAllowance: 1_230,
  specialExpensesAllowance: 36,
  // §24b EStG 2026 Entlastungsbetrag für Alleinerziehende (Steuerklasse II).
  // Source: §24b Abs. 2 EStG: 4,260 EUR base (first child) + 240 EUR per additional child.
  // https://www.gesetze-im-internet.de/estg/__24b.html
  entlastungsbetragAlleinerziehende: 4_260,
  entlastungsbetragAlleinerziehendePro: 240,
  // Altersvorsorgedepot 2027 — Altersvorsorgereformgesetz (Bundestag 2026-03-27).
  // Constants from Bundesrat Drucksache 206/26 (Bundestag-adopted text).
  // Bundesrat consent expected 2026-05-08; re-verify against BGBl. before relying on
  // any constant that might change in the Bundesrat consent step.
  altersvorsorgedepot: {
    productStartYear: 2027,
    specialExpenseOwnContributionCap: 1_800,
    contractContributionCapAnnual: 6_840,
    minimumOwnContributionAnnual: 120,
    basicAllowanceTier1MaxContribution: 360,
    basicAllowanceTier1Rate: 0.50,
    basicAllowanceTier2MaxContribution: 1_800,
    basicAllowanceTier2Rate: 0.25,
    basicAllowanceMax: 540,
    indirectSpouseBasicAllowanceMax: 175,
    careerStarterBonus: 200,
    careerStarterMaxAge: 24,
    childAllowanceRate: 1.0,
    childAllowanceMax: 300,
    standarddepotEffektivkostenCap: 0.01,
    glidepathHighRiskMax5YearsBefore: 0.50,
    glidepathHighRiskMax2YearsBefore: 0.30,
    payoutMinAge: 65,
    payoutMaxFirstAge: 70,
    partialCapitalMaxPct: 0.30,
    payoutPlanMinEndAge: 85,
    transferCostOldProviderWithin5YearsEUR: 150,
    transferCostNewProviderEUR: 150,
  },
  incomeTax: {
    basicAllowance: 12_348,
    firstProgressionEnd: 17_799,
    secondProgressionEnd: 69_878,
    topTaxStart: 277_826,
    // §3 Abs. 3 SolzG: Soli-Freigrenze 2026.
    // Einzelveranlagung 20,350 EUR; Zusammenveranlagung 40,700 EUR (= 2 × Einzelveranlagung).
    // Source: SolzG 1995 i.d.F. d. JStG 2024 (Anhebung 1.1.2026).
    //   https://www.gesetze-im-internet.de/solzg_1995/__3.html
    solidarityFreeTax: 20_350,
    solidarityFreeTaxMarried: 40_700,
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
    // KV/PV Beitragsbemessungsgrenze monthly ceiling (§6 Abs. 7 SGB V / §55 Abs. 2 SGB XI).
    // = healthCareCapYear / 12 = 69,750 / 12 = 5,812.50 EUR/month.
    // Source: BMAS BBG-Bekanntmachung 2026 (Verordnung über maßgebende Rechengrößen der
    //   Sozialversicherung für 2026 (SVBezGrV 2026), BGBl. 2025 I Nr. 278, §2 Abs. 2) — 69,750 EUR/year.
    //   https://www.bundesgesundheitsministerium.de/beitraege
    healthAndCareCapMonth: 5_812.50,
    // Bezugsgröße West 2026 nach §18 Abs. 1 SGB IV
    bezugsgroesseMonthly: 3_955,
    // SGB VI Anlage 1: vorläufiges Durchschnittsentgelt 2026 — denominator for Entgeltpunkte.
    // Source: SVBezGrV 2026 §3 Abs. 2 (BGBl. 2025 I Nr. 278).
    durchschnittsentgelt: 51_944,
    // Aktueller Rentenwert. The value steps up mid-year per §69 SGB VI:
    //   2026-01-01 .. 2026-06-30: 40.79 EUR/EP
    //   2026-07-01 onwards:       42.52 EUR/EP
    // The calculator treats this as constant across the projection horizon, so we
    // use the announced post-July 2026 value for forward-looking projections.
    //
    // Validation note:
    //   The DRV Rentenschätzer page still shows 40.79 EUR/EP before 2026-07-01.
    //   Do not use that page as a direct equality oracle for this field until the
    //   post-July value is live, or split the rules into period-specific values.
    //
    // Source: BMAS Rentenwertbestimmungsverordnung 2026 / Rentenanpassung 2026.
    aktuellerRentenwert: 42.52,
  },
  bav: {
    taxFreePctOfPensionCap: 0.08,
    socialSecurityFreePctOfPensionCap: 0.04,
    statutoryEmployerSubsidyPct: 0.15,
  },
  basisrente: {
    // §10 Abs. 3 EStG 2026: Höchstbetrag for Schicht-1 Vorsorgeaufwendungen.
    // Anchored to 2 × (pensionCapYear West × Gesamtbeitragssatz GRV).
    // 2 × 101,400 × 18.6% / 2 is the employee equivalent but the statutory cap
    // is higher because it covers both employee AND employer shares together.
    // Statutory value for 2026: 30,826 EUR (Einzelveranlagung).
    // Source: §10 Abs. 3 Satz 1 EStG i.d.F. ab 2023.
    schicht1CapSingle: 30_826,
    // §10 Abs. 3 EStG: 100% deductible from 2023 onwards (Wachstumschancengesetz fast-tracked
    // the original 2025 milestone to 2023; no further progression needed).
    deductibleFraction: 1.0,
  },
  // Legacy Riester / Altersvorsorgevertrag old-law constants for 2026.
  // Source: §84–§86 EStG, §10a EStG (Altersvorsorgezulagenrecht).
  // No new Riester contracts from 2027 under the Altersvorsorgereformgesetz; existing contracts continue.
  // https://www.gesetze-im-internet.de/estg/__84.html
  // https://www.gesetze-im-internet.de/estg/__85.html
  // https://www.gesetze-im-internet.de/estg/__86.html
  // https://www.gesetze-im-internet.de/estg/__10a.html
  riester: {
    // §84 EStG: Grundzulage 175 EUR/year for directly eligible savers.
    // Source: §84 Satz 1 EStG i.d.F. 2021 (raised from 154 to 175 via Jahressteuergesetz 2018).
    grundzulage: 175,
    // §85 Abs. 1 EStG: Kinderzulage 185 EUR/year for children born before 2008.
    childAllowancePre2008: 185,
    // §85 Abs. 1 EStG: Kinderzulage 300 EUR/year for children born from 2008 onwards.
    childAllowancePost2007: 300,
    // §84 EStG: one-time Berufseinsteiger-Bonus 200 EUR for savers under 25 at contract start.
    careerStarterBonus: 200,
    // Maximum age (inclusive) for career-starter bonus: under 25 = age ≤ 24.
    careerStarterMaxAge: 24,
    // §86 Abs. 1 EStG: Mindesteigenbeitrag = max(Sockelbetrag, 4% × RV-Pflichtentgelt − Zulagen).
    minEigenbeitragPct: 0.04,
    // §86 Abs. 1 Satz 4 EStG: Sockelbetrag 60 EUR/year.
    sockelbetrag: 60,
    // §10a Abs. 1 EStG: annual Sonderausgabenabzug cap = 2,100 EUR (own contribution + allowances).
    annualCapInclAllowances: 2_100,
  },
  capitalGains: {
    taxRate: 0.25,
    solidarityRate: 0.055,
    saverAllowance: 1_000,
    // BMF Basiszins nach §203 BewG für Vorabpauschale 2026: 3.20 % (BMF-Schreiben 2026-01-13)
    basiszins: 0.032,
  },
}
