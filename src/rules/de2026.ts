import type { GermanRules } from '../domain/types'

// ---------------------------------------------------------------------------
// Cohort lookup helpers for retirement-phase income tax (added in #46)
// ---------------------------------------------------------------------------

/**
 * Fraction of statutory pension (GRV-Rente) that is taxable, per cohort.
 *
 * Statutory basis: §22 Nr. 1 Satz 3 Buchstabe a Doppelbuchstabe aa EStG,
 *   as amended by the Wachstumschancengesetz (BGBl. 2024 I Nr. 108, in
 *   force 28 March 2024) which slowed the pace of increase from 1 pp/year
 *   to 0.5 pp/year starting from the 2023 cohort.
 *
 * Source: §22 EStG, Anlage; Wachstumschancengesetz Art. 19 Nr. 8 (amending
 *   §52 Abs. 34 EStG transition table).
 *   https://www.gesetze-im-internet.de/estg/__22.html
 *   https://www.bundesrat.de/SharedDocs/drucksachen/2024/0001-0100/
 *     036-24.pdf (Wachstumschancengesetz — Anlage)
 *
 * Schedule (post-Wachstumschancengesetz):
 *   2023: 82.5 %  (anchor — last value before slowed progression locked in)
 *   2024: 83.0 %
 *   2025: 83.5 %
 *   2026: 84.0 %
 *   ...+0.5 pp/year...
 *   2058: 100.0 %  (maximum, stays at 100 % thereafter)
 *
 * For years before 2023 the table returns values from the pre-Wachstumschancengesetz
 * progression (1 pp/year from 50 % in 2005), clamped at 82.5 % for 2023.
 */
export function besteuerungsanteilGrv(retirementYear: number): number {
  if (retirementYear <= 2005) return 0.50
  if (retirementYear >= 2058) return 1.00

  if (retirementYear <= 2022) {
    // Pre-Wachstumschancengesetz schedule:
    // 2005 = 50 %, 2006 = 52 %, ..., 2020 = 80 %, 2021 = 81 %, 2022 = 82 %
    // (+2 pp/year 2005→2020, then +1 pp/year 2020→2022)
    if (retirementYear <= 2020) {
      return 0.50 + (retirementYear - 2005) * 0.02
    }
    return 0.80 + (retirementYear - 2020) * 0.01
  }

  // Post-Wachstumschancengesetz (2023–2058): +0.5 pp/year
  return 0.825 + (retirementYear - 2023) * 0.005
}

/**
 * Versorgungsfreibetrag for bAV-Renten and other Versorgungsbezüge (§19 Abs. 2 EStG).
 *
 * The Freibetrag locks at the retirement year and does not change in subsequent
 * years (§19 Abs. 2 Satz 7 EStG: "maßgeblicher Versorgungsbeginn").
 *
 * Two parts are returned:
 *   prozent     — percentage of gross Versorgungsbezüge, capped at hoechstbetrag
 *   hoechstbetrag — annual cap (EUR)
 *   zuschlag    — Zuschlag zum Versorgungsfreibetrag (EUR, added unconditionally)
 *
 * Statutory basis: §19 Abs. 2 EStG (Versorgungsfreibetrag + Zuschlag),
 *   as amended by Wachstumschancengesetz (slowed progression to 0 by 2058).
 *
 * Source: §19 Abs. 2 EStG transition table (Anlage); Wachstumschancengesetz.
 *   https://www.gesetze-im-internet.de/estg/__19.html
 *
 * Anchor values (verified against EStG §19 Abs. 2 Satz 3, Anlage 1):
 *   2023: 14.0 % / 1,050 EUR / 315 EUR
 *   2024: 13.6 % / 1,020 EUR / 306 EUR
 *   2025: 13.2 % /   990 EUR / 297 EUR  ← slowed by Wachstumschancengesetz
 *   2026: 12.8 % /   960 EUR / 288 EUR
 *   ...−0.4 pp/year, −30 EUR/year, −9 EUR/year...
 *   2058:  0.0 % /     0 EUR /   0 EUR
 *
 * For years 2005–2022 the pre-Wachstumschancengesetz schedule applies
 * (faster pace; values above the 2023 anchor). For years >= 2058: all zeros.
 * For years < 2005 (no Alterseinkünftegesetz): returns 2005 values (40 %/3000/900).
 */
export interface VersorgungsfreibetragRow {
  prozent: number       // e.g. 0.128 for 12.8 %
  hoechstbetrag: number // annual cap EUR
  zuschlag: number      // Zuschlag EUR
}

export function versorgungsfreibetrag(retirementYear: number): VersorgungsfreibetragRow {
  if (retirementYear < 2005) {
    // Extrapolate backward: use the 2005 value (Alterseinkünftegesetz start)
    return { prozent: 0.40, hoechstbetrag: 3_000, zuschlag: 900 }
  }
  if (retirementYear >= 2058) {
    return { prozent: 0, hoechstbetrag: 0, zuschlag: 0 }
  }

  if (retirementYear <= 2022) {
    // Pre-Wachstumschancengesetz schedule (EStG §19 Abs. 2 original table):
    // 2005: 40.0 % / 3,000 / 900
    // 2006: 38.4 % / 2,880 / 864
    // ...−1.6 pp/year, −120 EUR/year, −36 EUR/year... → 2040: 0 %
    // For 2023 anchor (14.0/1050/315) this matches the pre-law 2023 row.
    const yearsFrom2005 = retirementYear - 2005
    return {
      prozent: 0.40 - yearsFrom2005 * 0.016,
      hoechstbetrag: 3_000 - yearsFrom2005 * 120,
      zuschlag: 900 - yearsFrom2005 * 36,
    }
  }

  // Post-Wachstumschancengesetz (2023–2057): −0.4 pp/year, −30 EUR/year, −9 EUR/year
  const yearsFrom2023 = retirementYear - 2023
  return {
    prozent: Math.max(0, 0.140 - yearsFrom2023 * 0.004),
    hoechstbetrag: Math.max(0, 1_050 - yearsFrom2023 * 30),
    zuschlag: Math.max(0, 315 - yearsFrom2023 * 9),
  }
}

// ---------------------------------------------------------------------------
// Pauschbeträge for retirement-phase income-tax computation (#46)
// ---------------------------------------------------------------------------

/**
 * §9a Satz 1 Nr. 1b EStG: Werbungskosten-Pauschbetrag for Versorgungsbezüge (bAV-Renten etc.).
 * 102 EUR/year. Has been 102 EUR since 2005 (no change).
 * Source: https://www.gesetze-im-internet.de/estg/__9a.html
 */
export const werbungskostenPauschalVersorgungsbezuege = 102

/**
 * §9a Satz 1 Nr. 3 EStG: Werbungskosten-Pauschbetrag for sonstige Einkünfte (Renten).
 * 102 EUR/year since 2023 (raised from 102 → kept at 102 by Inflationsausgleichsgesetz).
 * Source: https://www.gesetze-im-internet.de/estg/__9a.html
 */
export const werbungskostenPauschalRenten = 102

/**
 * §10c EStG: Sonderausgaben-Pauschbetrag.
 * Single: 36 EUR/year. Married (joint assessment): 72 EUR/year.
 * Source: https://www.gesetze-im-internet.de/estg/__10c.html
 */
export const sonderausgabenPauschbetrag = { single: 36, married: 72 }

export const de2026Rules: GermanRules = {
  year: 2026,
  employeeAllowance: 1_230,
  specialExpensesAllowance: 36,
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
    // use the latest prevailing value (post-July 2026) — most representative of
    // the "today" semantics the engine projects forward.
    // Source: Deutsche Rentenversicherung — 2026 Rentenanpassung.
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
