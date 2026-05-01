import type { AltersvorsorgedepotAssumptions, PersonalProfile, RiesterAssumptions, ScenarioAssumptions } from '../domain'

export const defaultProfile: PersonalProfile = {
  age: 28,
  retirementAge: 67,
  grossSalaryYear: 75_000,
  taxClass: 1,
  childBirthYears: [],
  churchTax: false,
  publicHealthInsurance: true,
  healthAdditionalContributionPct: 2.9,
  // #50: PKV premiums — zero when GKV (publicHealthInsurance = true).
  // 500 EUR/month KV + 50 EUR/month pPV are market-typical 2026 values for a healthy
  // 28-year-old; users should enter their actual premium from their PKV offer.
  pkvMonthlyPremium: 0,
  pPVMonthlyPremium: 0,
  // 0 = "no target set". Storage's mergeDeep cannot round-trip an `undefined`
  // default, so we use 0 as the sentinel and DecisionSummary checks `> 0`.
  desiredNetMonthlyPension: 0,
}

// Exported separately so tests can import without pulling the whole defaultAssumptions object.
export const defaultAvdAssumptions: AltersvorsorgedepotAssumptions = {
  // Standarddepot is the lowest-cost certified product variant with the RIY cap.
  subtype: 'standarddepot',
  // 200 EUR/month — same starting value as bAV brutto, Basisrente brutto, Riester
  // Eigenbeitrag for visual consistency. Defaults are not actually synced (each
  // field has different units/semantics); editing any of the four product
  // contribution fields engages syncMonthlyContributions to align the others
  // around a common monthly net cost.
  monthlyOwnContribution: 200,
  eligibility: {
    directlyEligible: true,
    indirectSpouseEligible: false,
    eligibleChildren: 0,
    // Default profile is 28 years old; career-starter bonus already passed for simplicity.
    ageAtContractStart: 28,
    careerStarterBonusUsed: true,
  },
  // Standarddepot default allocation: 80% high-risk OGAW (SRI 3–5), 20% low-risk.
  // Actual allocation de-risks automatically via glidepath near retirement.
  riskAllocationPct: 0.80,
  // High-risk sleeve return matches the user's selected return scenario in simulate.ts.
  // Low-risk sleeve: 2% p.a. market-typical for bond / money-market OGAW (SRI 1–2).
  riskAnnualReturn: 0.05,   // placeholder; overridden by scenario in simulate.ts
  lowRiskAnnualReturn: 0.02,
  fees: {
    // Standarddepot cost cap = 1.0 pp Effektivkosten. Defaults to a competitive provider.
    wrapperAssetFee: 0.003,   // 0.30 % Depot-/Vertragsverwaltungsgebühr
    fundAssetFee: 0.002,      // 0.20 % Fonds-TER — total 0.50 % p.a. well within the 1.0 pp cap
    contributionFee: 0,
    fixedMonthlyFee: 0,
    acquisitionCostPct: 0,
    acquisitionCostSpreadYears: 5,
    pensionPayoutFeePct: 0,
  },
  payoutMode: 'certified_payout_plan',
  payoutPlanEndAge: 85,    // minimum allowed; can extend to e.g. 90
  partialCapitalPct: 0,    // no partial capital by default
  transferCostEUR: 0,
  riesterTransferCapital: 0,
  monthlyOtherRetirementIncome: 0,
  // Rentenfaktor for lifelong_annuity mode: 28 EUR/10k/Monat market-typical for age-67 starts.
  rentenfaktor: 28,
}

export const defaultRiesterAssumptions: RiesterAssumptions = {
  // 200 EUR/month — same starting value as the other three contribution fields.
  // Note: below Mindesteigenbeitrag for 75k brutto (~235 EUR/month), so allowances
  // are prorated. User can raise the value (sync re-anchors the others) to reach
  // full allowances if Riester is the comparison focus.
  monthlyOwnContribution: 200,
  // Existing capital from a prior contract — 0 for a new/hypothetical contract.
  existingCapital: 0,
  eligibility: {
    directlyEligible: true,
    // Default profile is 28; assume the career-starter bonus was not yet claimed.
    ageAtContractStart: 28,
    careerStarterBonusUsed: false,
  },
  // Typical Riester insurance cost structure (similar to private insurance).
  fees: {
    wrapperAssetFee: 0.012,
    fundAssetFee: 0.002,
    contributionFee: 0.03,
    fixedMonthlyFee: 5,
    acquisitionCostPct: 0.025,
    acquisitionCostSpreadYears: 5,
    pensionPayoutFeePct: 0,
  },
  // Lifelong annuity is the typical Riester payout form.
  payoutMode: 'leibrente' as const,
  rentenfaktor: 28,
  zeitrenteYears: 20,
  // No partial capital payout by default (most users keep full annuity).
  partialCapitalPct: 0,
  monthlyOtherRetirementIncome: 0,
}

export const defaultAssumptions: ScenarioAssumptions = {
  inflationRate: 0.02,
  retirementEndAge: 90,
  // UX10: default comparison is the most common pair (ETF + bAV). Users widen the
  // comparison via the ComparisonPicker; the guided-setup path can also pre-select
  // a different baseline (e.g. ETF + pAV for the "ETF vs Versicherung" path).
  visibleProducts: ['etf', 'bav'],
  returnScenarios: [
    { id: 'konservativ', label: 'Konservativ', annualReturn: 0.03 },
    { id: 'basis', label: 'Basis', annualReturn: 0.05 },
    { id: 'optimistisch', label: 'Optimistisch', annualReturn: 0.07 },
  ],
  etf: {
    annualAssetFee: 0.002,
    equityPartialExemption: 0.3,
  },
  bav: {
    // 200 EUR/month brutto — same starting value as the other three contribution
    // fields (Basisrente brutto, AVD Eigenbeitrag, Riester Eigenbeitrag).
    // Editing any field engages syncMonthlyContributions to align the others
    // around a common monthly net cost. §3 Nr. 63 EStG cap: 338 EUR/month
    // (4 % × BBG 101,400 EUR / 12) is the maximum fully tax- and SV-free contribution.
    monthlyGrossConversion: 200,
    // #51: §1a Abs. 1a BetrAVG default — statutory subsidy on, no contractual extras.
    statutoryMinimumSubsidyEnabled: true,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
    monthlyOtherRetirementIncome: 0,
    includeGrvReduction: false,
    kvdrMember: true,
    // #48: default to modern §3 Nr. 63 EStG Direktversicherung
    durchfuehrungsweg: 'direktversicherung_3_63' as const,
    // #48: pre-2005 eligibility flag — only relevant for direktversicherung_40b_alt
    pre2005EligibleTaxFree: false,
    // #54: bAV-Renten typically Leibrente. 30 EUR/10k/Monat is a market-typical 2026
    // unisex Rentenfaktor for age-67 starts (range 25–35 across providers); see LEGAL_REVIEW.md.
    payoutMode: 'leibrente' as const,
    rentenfaktor: 30,
    zeitrenteYears: 20,
    fees: {
      wrapperAssetFee: 0.003,   // 0.30 % Versicherungsmantel
      fundAssetFee: 0.005,      // 0.50 % aktiv verwalteter Fonds (bAV-typisch) — total 0.80 % p.a.
      contributionFee: 0.03,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
  basisrente: {
    // 200 EUR/month brutto — same starting value as the other three contribution
    // fields. Most Rürup contracts start in the 100–300 EUR/month range.
    monthlyGrossContribution: 200,
    // Basisrente old-age payout is always leibrente per AltZertG §2 / §10 Abs. 1 Nr. 2 EStG.
    payoutMode: 'leibrente' as const,
    // 28 EUR/10k/Monat: 2026 market-typical Rentenfaktor for age-67 starts.
    rentenfaktor: 28,
    monthlyOtherRetirementIncome: 0,
    fees: {
      wrapperAssetFee: 0.012,   // 1.20 % — typical Basisrente insurance wrapper
      fundAssetFee: 0.002,      // 0.20 % ETF-Fondskosten — total 1.40 % p.a.
      contributionFee: 0.03,
      fixedMonthlyFee: 5,
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
  },
  statutoryPension: {
    pensionBaselineType: 'grv' as const,
    // null = use EP-based estimation; set to a specific number to use a Renteninformation override
    manualMonthlyGross: null,
    // Seed with a realistic EP count for the default 28-year-old profile (~6 years at avg salary).
    // Users should replace this with the value from their last Renteninformation letter.
    currentEntgeltpunkte: 8,
    includeGrvReduction: false,
    annualSalaryGrowthRate: 0,
    rentenwertGrowthRate: 0,
    versorgungswerkMonthlyContribution: 0,
    versorgungswerkEmployerMonthly: 0,
    // KVdR is the default for the typical employee profile. Drives KV/PV for AVD,
    // Riester, Basisrente payouts (sonstige Einkünfte → 0 KV/PV for KVdR).
    retirementHealthStatus: 'kvdr' as const,
  },
  altersvorsorgedepot: {
    ...defaultAvdAssumptions,
    riesterTransferCapital: 0,
  },
  riester: defaultRiesterAssumptions,
  insurance: {
    contractStartYear: 2024,
    oldContractTaxFreeEligible: false,
    monthlyOtherRetirementIncome: 0,
    // #54: pAV defaults — Leibrente is the typical contractual form. Private contracts often
    // quote slightly lower Rentenfaktoren than bAV (higher costs and unisex pricing); 28 EUR/10k
    // chosen as a 2026 market-typical default. See LEGAL_REVIEW.md.
    payoutMode: 'leibrente' as const,
    rentenfaktor: 28,
    zeitrenteYears: 20,
    fees: {
      // 2026 market reference: Alte Leipziger HFR10 (Testsieger, Honorartarif via Maiwerk).
      // 0,3 % vom Guthaben + 36 EUR Fixgebühr p.a., 0 % Zuzahlungskosten, 1,5 % im Rentenbezug;
      // Abschlusskosten 0 (externes Honorar 299 EUR liegt außerhalb des Vertrags).
      wrapperAssetFee: 0.003,   // 0,30 % Versicherungsmantel
      fundAssetFee: 0.002,      // 0,20 % ETF-Fondskosten — total 0,50 % p.a.
      contributionFee: 0,
      fixedMonthlyFee: 3,       // 36 EUR/Jahr Fixgebühr
      acquisitionCostPct: 0.025,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0.015,
    },
    // #65: no paid-up scenario by default; zero surrender haircut
    surrenderHaircutPct: 0,
  },
}
